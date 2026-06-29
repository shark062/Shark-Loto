import { Router, Request, Response, NextFunction } from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  providers,
  getProviderApiKey,
  getEffectiveApiKey,
  listProviders,
  updateProvider,
  testProvider,
} from "../lib/aiProviders";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8h
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 };

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}

function hashPassword(password: string, salt: string): string {
  const derived = scryptSync(password, salt, SCRYPT_PARAMS.dkLen, {
    N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p,
  });
  return derived.toString("hex");
}

async function getJwtSecret(): Promise<string> {
  let secret = await getSetting("admin_jwt_secret");
  if (!secret) {
    secret = randomBytes(48).toString("hex");
    await setSetting("admin_jwt_secret", secret);
  }
  return secret;
}

function makeToken(secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ iat: Date.now(), exp: Date.now() + TOKEN_EXPIRY_MS })
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return Date.now() < exp;
  } catch {
    return false;
  }
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação necessário" });
    return;
  }
  const token = auth.slice(7);
  const secret = await getJwtSecret();
  if (!verifyToken(token, secret)) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }
  next();
}

// ── GET /api/admin/status — verifica se o painel já foi configurado ───────────

router.get("/status", async (_req: Request, res: Response) => {
  const hash = await getSetting("admin_password_hash");
  res.json({
    setup_needed: !hash,
    version: "1.0.0",
  });
});

// ── POST /api/admin/setup — configura senha inicial ───────────────────────────

router.post("/setup", async (req: Request, res: Response) => {
  const existing = await getSetting("admin_password_hash");
  if (existing) {
    res.status(409).json({ error: "Painel já configurado. Use /api/admin/login." });
    return;
  }
  const { password } = req.body as { password?: string };
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres." });
    return;
  }
  const salt = randomBytes(32).toString("hex");
  const hash = hashPassword(password, salt);
  await setSetting("admin_password_hash", `${salt}:${hash}`);

  const secret = await getJwtSecret();
  const token = makeToken(secret);
  logger.info("Admin panel configurado com sucesso");
  res.status(201).json({ token, expires_in_hours: 8 });
});

// ── POST /api/admin/login ─────────────────────────────────────────────────────

router.post("/login", async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "Senha obrigatória" });
    return;
  }
  const stored = await getSetting("admin_password_hash");
  if (!stored) {
    res.status(404).json({ error: "Painel não configurado ainda. Use /api/admin/setup." });
    return;
  }
  const [salt, storedHash] = stored.split(":");
  const inputHash = hashPassword(password, salt);
  const match = timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
  if (!match) {
    res.status(401).json({ error: "Senha incorreta" });
    return;
  }
  const secret = await getJwtSecret();
  const token = makeToken(secret);
  res.json({ token, expires_in_hours: 8 });
});

// ── GET /api/admin/providers — lista providers com status (auth) ───────────────

router.get("/providers", requireAuth, (_req: Request, res: Response) => {
  const { providers: list, stats } = listProviders();
  const enriched = list.map((p) => {
    const envKey = getEffectiveApiKey(p.type);
    const hasEnvKey = !!envKey;
    return {
      ...p,
      hasDbKey: false,          // chaves são env-only; DB não é mais fonte de API keys
      hasEnvKey,
      keySource: hasEnvKey ? "env" : "nenhuma",
    };
  });
  res.json({ providers: enriched, stats });
});

// ── PUT /api/admin/providers/:id/key — salva chave diretamente no banco ────────

router.put("/providers/:id/key", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { apiKey } = req.body as { apiKey?: string };

  if (!apiKey || apiKey.trim() === "") {
    res.status(400).json({ error: "apiKey não pode ser vazia" });
    return;
  }

  const updated = await updateProvider(id, { apiKey: apiKey.trim(), enabled: true });
  if (!updated) {
    res.status(404).json({ error: "Provider não encontrado" });
    return;
  }
  logger.info({ id, type: updated.type }, "Chave de API atualizada via painel admin");
  res.json({ success: true, type: updated.type, name: updated.name });
});

// ── DELETE /api/admin/providers/:id/key — remove chave do banco ────────────────

router.delete("/providers/:id/key", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = await updateProvider(id, { apiKey: "__env__" });
  if (!updated) {
    res.status(404).json({ error: "Provider não encontrado" });
    return;
  }
  res.json({ success: true });
});

// ── PATCH /api/admin/providers/:id/toggle — habilita/desabilita ───────────────

router.patch("/providers/:id/toggle", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const provider = [...providers.values()].find((p) => p.id === id);
  if (!provider) {
    res.status(404).json({ error: "Provider não encontrado" });
    return;
  }
  const updated = await updateProvider(id, { enabled: !provider.enabled });
  res.json({ success: true, enabled: updated?.enabled });
});

// ── POST /api/admin/providers/:id/test — testa provider (auth) ────────────────

router.post("/providers/:id/test", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await testProvider(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/admin/password — muda senha (auth) ───────────────────────────────

router.put("/password", requireAuth, async (req: Request, res: Response) => {
  const { current, newPassword } = req.body as { current?: string; newPassword?: string };
  if (!current || !newPassword) {
    res.status(400).json({ error: "current e newPassword são obrigatórios" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Nova senha deve ter no mínimo 8 caracteres" });
    return;
  }
  const stored = await getSetting("admin_password_hash");
  if (!stored) {
    res.status(404).json({ error: "Painel não configurado" });
    return;
  }
  const [salt, storedHash] = stored.split(":");
  const inputHash = hashPassword(current, salt);
  const match = timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
  if (!match) {
    res.status(401).json({ error: "Senha atual incorreta" });
    return;
  }
  const newSalt = randomBytes(32).toString("hex");
  const newHash = hashPassword(newPassword, newSalt);
  await setSetting("admin_password_hash", `${newSalt}:${newHash}`);
  // Rotaciona o JWT secret (invalida todos os tokens existentes)
  await setSetting("admin_jwt_secret", randomBytes(48).toString("hex"));
  const secret = await getJwtSecret();
  const token = makeToken(secret);
  res.json({ success: true, token, expires_in_hours: 8 });
});

// ── GET /api/admin/health — saúde geral do sistema (auth) ─────────────────────

router.get("/health", requireAuth, (_req: Request, res: Response) => {
  const all = [...providers.values()];
  const withKey = all.filter((p) => !!getProviderApiKey(p));
  const active = all.filter((p) => p.enabled && !!getProviderApiKey(p));
  res.json({
    total_providers: all.length,
    providers_with_key: withKey.length,
    active_providers: active.length,
    providers: all.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      enabled: p.enabled,
      hasKey: !!getProviderApiKey(p),
      successRate: (p.successRate * 100).toFixed(1) + "%",
      totalCalls: p.totalCalls,
      lastError: p.lastError,
    })),
  });
});

export default router;
