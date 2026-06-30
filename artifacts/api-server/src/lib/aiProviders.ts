import { randomUUID } from "crypto";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { aiProvidersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  classifyHttpError,
  classifyNetworkError,
  recordSuccess,
  recordFailure,
  isAvailable,
  getHealth,
  sleep,
  withRetry,
} from "./aiHealthManager";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  type: string;
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  successRate: number;
  totalCalls: number;
  successCalls: number;
  avgLatencyMs: number;
  lastUsed: string | null;
  lastError: string | null;
}

export interface EvolutionLogEntry {
  providerName: string;
  action: "success" | "error" | "added" | "removed" | "updated";
  latencyMs?: number;
  details?: string;
  timestamp: string;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

export const providers = new Map<string, ProviderConfig>();
export const evolutionLog: EvolutionLogEntry[] = [];

// ─── Mapeamento tipo → variáveis de ambiente ──────────────────────────────────

export const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  openai:     ["OPENAI_API_KEY",     "OpenAI_API_KEY",    "openai_api_key"],
  anthropic:  ["ANTHROPIC_API_KEY",  "Anthropic_API_KEY", "anthropic_api_key"],
  gemini:     ["GOOGLE_API_KEY",     "Google_API_KEY",    "google_api_key"],
  groq:       ["GROQ_API_KEY",       "Groq_API_KEY",      "groq_api_key"],
  deepseek:   ["DEEPSEEK_API_KEY",   "Deepseek_API_KEY",  "deepseek_api_key"],
  openrouter: ["OPENROUTER_API_KEY", "OpenRouter_API_KEY","openrouter_api_key"],
  mistral:    ["MISTRAL_API_KEY",    "Mistral_API_Key",   "mistral_api_key"],
  cohere:     ["COHERE_API_KEY",     "Chore_API_KEY",     "cohere_api_key"],
  together:   ["TOGETHER_API_KEY",   "Together_API_KEY",  "together_api_key"],
};

/**
 * Prioridade de chave:
 * 1. Variável ENV do ambiente (Render/Replit)
 * 2. Banco de dados
 * 3. null (não configurada)
 */
export function getEffectiveApiKey(type: string): string | null {
  const variants = PROVIDER_ENV_KEYS[type];
  if (!variants) return null;
  for (const envVar of variants) {
    const val = process.env[envVar];
    if (val && val.trim() !== "") return val.trim();
  }
  return null;
}

/**
 * Retorna a chave real de um provider.
 * APENAS variáveis de ambiente — banco de dados não é mais usado como fonte de chave.
 * Isso evita conflito entre chaves antigas no banco e chaves atuais do servidor.
 */
export function getProviderApiKey(provider: ProviderConfig): string | null {
  return getEffectiveApiKey(provider.type);
}

// ─── Default URLs e modelos ───────────────────────────────────────────────────

const DEFAULT_URLS: Record<string, string> = {
  openai:     "https://api.openai.com/v1",
  anthropic:  "https://api.anthropic.com/v1",
  gemini:     "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek:   "https://api.deepseek.com/v1",
  groq:       "https://api.groq.com/openai/v1",
  mistral:    "https://api.mistral.ai/v1",
  cohere:     "https://api.cohere.com/compatibility/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together:   "https://api.together.xyz/v1",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai:     "gpt-4o-mini",
  anthropic:  "claude-3-5-haiku-20241022",
  gemini:     "gemini-2.0-flash",
  deepseek:   "deepseek-chat",
  groq:       "llama-3.3-70b-versatile",
  mistral:    "mistral-small-latest",
  cohere:     "command-a-03-2025",
  openrouter: "meta-llama/llama-3.2-3b-instruct:free",
  together:   "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
};

// ─── Mascaramento de chave ────────────────────────────────────────────────────

function maskApiKey(key: string): string {
  if (!key) return "não configurada";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}${"*".repeat(Math.min(8, key.length - 6))}${key.slice(-2)}`;
}

// ─── DB row → ProviderConfig ──────────────────────────────────────────────────

function rowToConfig(row: any): ProviderConfig {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    apiKey: row.apiKey,
    model: row.model,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    priority: row.priority,
    successRate: parseFloat(row.successRate ?? "0.7"),
    totalCalls: row.totalCalls ?? 0,
    successCalls: row.successCalls ?? 0,
    avgLatencyMs: parseFloat(row.avgLatencyMs ?? "0"),
    lastUsed: row.lastUsed ?? null,
    lastError: row.lastError ?? null,
  };
}

// ─── Load providers from DB ───────────────────────────────────────────────────

export async function loadProvidersFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(aiProvidersTable);
    providers.clear();
    for (const row of rows) {
      providers.set(row.id, rowToConfig(row));
    }
    logger.info({ count: rows.length }, "Providers carregados do banco de dados");
  } catch (err: any) {
    logger.error({ err: err.message }, "Falha ao carregar providers do banco");
  }
}

// ─── Persist provider to DB ───────────────────────────────────────────────────

async function persistProvider(p: ProviderConfig): Promise<void> {
  try {
    await db.insert(aiProvidersTable).values({
      id: p.id,
      type: p.type,
      name: p.name,
      apiKey: p.apiKey,
      model: p.model,
      baseUrl: p.baseUrl,
      enabled: p.enabled,
      priority: p.priority,
      successRate: String(p.successRate),
      totalCalls: p.totalCalls,
      successCalls: p.successCalls,
      avgLatencyMs: String(p.avgLatencyMs),
      lastUsed: p.lastUsed ?? undefined,
      lastError: p.lastError ?? undefined,
    }).onConflictDoUpdate({
      target: aiProvidersTable.id,
      set: {
        type: p.type,
        name: p.name,
        apiKey: p.apiKey,
        model: p.model,
        baseUrl: p.baseUrl,
        enabled: p.enabled,
        priority: p.priority,
        successRate: String(p.successRate),
        totalCalls: p.totalCalls,
        successCalls: p.successCalls,
        avgLatencyMs: String(p.avgLatencyMs),
        lastUsed: p.lastUsed ?? undefined,
        lastError: p.lastError,
        updatedAt: new Date(),
      },
    });
  } catch (err: any) {
    logger.warn({ err: err.message, id: p.id }, "Falha ao persistir provider no banco");
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listProviders(): {
  providers: (Omit<ProviderConfig, "apiKey"> & { apiKey: string; hasEnvKey: boolean; healthStatus: string })[];
  stats: { total: number; active: number; avgSuccessRate: number };
} {
  const list = [...providers.values()];
  const active = list.filter(p => p.enabled).length;
  const avgSuccessRate = list.length > 0
    ? list.reduce((s, p) => s + p.successRate, 0) / list.length
    : 0;
  const masked = list.map(p => {
    const effectiveKey = getProviderApiKey(p);
    const health = getHealth(p.id, p.name);
    return {
      ...p,
      apiKey: maskApiKey(effectiveKey ?? ""),
      hasEnvKey: !!effectiveKey,
      healthStatus: health.status,
    };
  });
  return { providers: masked, stats: { total: list.length, active, avgSuccessRate } };
}

export async function addProvider(input: {
  type: string;
  name: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): Promise<ProviderConfig> {
  const id = randomUUID();
  const provider: ProviderConfig = {
    id,
    type: input.type,
    name: input.name,
    apiKey: input.apiKey || "__env__",
    model: input.model || DEFAULT_MODELS[input.type] || "gpt-4o-mini",
    baseUrl: input.baseUrl || DEFAULT_URLS[input.type] || "https://api.openai.com/v1",
    enabled: true,
    priority: providers.size,
    successRate: 0.7,
    totalCalls: 0,
    successCalls: 0,
    avgLatencyMs: 0,
    lastUsed: null,
    lastError: null,
  };
  providers.set(id, provider);
  evolutionLog.unshift({ providerName: provider.name, action: "added", timestamp: new Date().toISOString() });
  logger.info({ id, type: provider.type, name: provider.name }, "Provider adicionado");
  await persistProvider(provider);
  return provider;
}

export async function updateProvider(id: string, updates: Partial<ProviderConfig>): Promise<ProviderConfig | null> {
  const provider = providers.get(id);
  if (!provider) return null;
  const immutable = ["id", "totalCalls", "successCalls", "successRate"];
  for (const [key, value] of Object.entries(updates)) {
    if (!immutable.includes(key)) {
      (provider as any)[key] = value;
    }
  }
  evolutionLog.unshift({ providerName: provider.name, action: "updated", timestamp: new Date().toISOString() });
  await persistProvider(provider);
  return provider;
}

export async function deleteProvider(id: string): Promise<boolean> {
  const provider = providers.get(id);
  if (!provider) return false;
  providers.delete(id);
  evolutionLog.unshift({ providerName: provider.name, action: "removed", timestamp: new Date().toISOString() });
  try {
    await db.delete(aiProvidersTable).where(eq(aiProvidersTable.id, id));
  } catch (err: any) {
    logger.warn({ err: err.message }, "Falha ao remover provider do banco");
  }
  return true;
}

export function getEvolutionLog(limit = 50): EvolutionLogEntry[] {
  return evolutionLog.slice(0, limit);
}

// ─── Executar chamada HTTP ao provider (com classificação de erro) ─────────────

async function executeProviderCall(
  provider: ProviderConfig,
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 512,
): Promise<string> {
  const start = Date.now();

  if (provider.type === "anthropic") {
    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        system: systemPrompt,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const errInfo = classifyHttpError(response.status, body);
      const err = new Error(`HTTP ${response.status}: ${errInfo.message}`);
      (err as any).body = body;
      throw err;
    }

    const data = await response.json() as any;
    const latencyMs = Date.now() - start;
    const text = data.content?.[0]?.text || "";

    logger.info({
      provider: provider.name,
      model: provider.model,
      latencyMs,
      tokens: data.usage?.output_tokens ?? "?",
      status: "success",
    }, "Provider: chamada concluída");

    return text;
  }

  // Chamada OpenAI-compatible
  const extraHeaders: Record<string, string> = {};
  if (provider.type === "openrouter") {
    extraHeaders["HTTP-Referer"] = "https://lotoshark.app";
    extraHeaders["X-Title"] = "LotoShark";
  }

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const body: Record<string, any> = {
    model: provider.model,
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: [{ role: "user", content: fullPrompt }],
  };
  if (provider.type === "deepseek") body.stream = false;

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const respBody = await response.text().catch(() => "");
    const errInfo = classifyHttpError(response.status, respBody);
    const err = new Error(`HTTP ${response.status}: ${errInfo.message}`);
    (err as any).body = respBody;
    throw err;
  }

  const data = await response.json() as any;
  const latencyMs = Date.now() - start;
  const text = data.choices?.[0]?.message?.content || "";

  logger.info({
    provider: provider.name,
    model: provider.model,
    latencyMs,
    tokens: data.usage?.completion_tokens ?? "?",
    status: "success",
  }, "Provider: chamada concluída");

  return text;
}

// ─── Test a provider ──────────────────────────────────────────────────────────

export async function testProvider(id: string): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
}> {
  const provider = providers.get(id);
  if (!provider) return { success: false, latencyMs: 0, message: "Provider não encontrado" };

  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    return { success: false, latencyMs: 0, message: "Chave de API não configurada para este provider" };
  }

  const start = Date.now();
  try {
    await executeProviderCall(provider, apiKey, "Responda apenas: OK", undefined, 10);
    const latencyMs = Date.now() - start;
    provider.lastUsed = new Date().toISOString();
    provider.lastError = null;
    evolutionLog.unshift({ providerName: provider.name, action: "success", latencyMs, details: "test", timestamp: new Date().toISOString() });
    persistProvider(provider).catch(() => {});
    return { success: true, latencyMs, message: "Provider funcionando corretamente" };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    provider.lastError = err.message?.slice(0, 120);
    evolutionLog.unshift({ providerName: provider.name, action: "error", latencyMs, details: `test: ${err.message?.slice(0, 60)}`, timestamp: new Date().toISOString() });
    persistProvider(provider).catch(() => {});
    return { success: false, latencyMs, message: err.message };
  }
}

// ─── Call the best available provider ────────────────────────────────────────
// Usa o Health Manager: nunca desliga por timeout/429 temporário/rede
// Só marca OFFLINE em 401/402/403 confirmados

export async function callBestProvider(prompt: string, systemPrompt?: string): Promise<string> {
  const sorted = [...providers.values()]
    .filter(p => p.enabled && !!getProviderApiKey(p) && isAvailable(p.id, p.name))
    .sort((a, b) => a.priority - b.priority);

  if (sorted.length === 0) {
    const missing = [...providers.values()]
      .filter(p => p.enabled && !getProviderApiKey(p))
      .map(p => p.name);
    throw new Error(
      missing.length > 0
        ? `Nenhum provider com chave configurada. Sem chave: ${missing.join(", ")}`
        : "Nenhum provider habilitado ou disponível"
    );
  }

  for (const provider of sorted) {
    const apiKey = getProviderApiKey(provider)!;
    const start = Date.now();

    try {
      const text = await withRetry(
        () => executeProviderCall(provider, apiKey, prompt, systemPrompt),
        provider.id,
        provider.name,
        "callBestProvider",
      );

      if (text) {
        const latencyMs = Date.now() - start;
        provider.totalCalls++;
        provider.successCalls++;
        provider.successRate = provider.successCalls / provider.totalCalls;
        provider.lastUsed = new Date().toISOString();
        provider.avgLatencyMs = provider.avgLatencyMs === 0
          ? latencyMs
          : Math.round(provider.avgLatencyMs * 0.8 + latencyMs * 0.2);
        recordSuccess(provider.id, provider.name, latencyMs);
        persistProvider(provider).catch(() => {});
        return text;
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      provider.totalCalls++;
      provider.successRate = provider.successCalls / Math.max(provider.totalCalls, 1);
      provider.lastError = err.message?.slice(0, 120);
      persistProvider(provider).catch(() => {});
      logger.warn({ provider: provider.name, latencyMs, err: err.message }, "callBestProvider: tentando próximo");
    }
  }

  throw new Error("Todos os providers falharam");
}

// ─── Recalculate priorities ───────────────────────────────────────────────────

export function recalcPriorities(): void {
  const sorted = [...providers.values()]
    .sort((a, b) => b.successRate - a.successRate);
  sorted.forEach((p, i) => { p.priority = i; });
}

// ─── Initialize providers ─────────────────────────────────────────────────────

export async function initDefaultProviders(): Promise<void> {
  await loadProvidersFromDB();

  const envProviders: Array<{ type: string; name: string }> = [
    { type: "openai",     name: "OpenAI" },
    { type: "anthropic",  name: "Anthropic" },
  ];

  let added = 0;
  let withKey = 0;
  let synced = 0;

  for (const ep of envProviders) {
    const envKey = getEffectiveApiKey(ep.type);
    const existing = [...providers.values()].find((p) => p.type === ep.type);

    if (!existing) {
      await addProvider({ type: ep.type, name: ep.name, apiKey: envKey ?? "__env__" });
      added++;
    } else {
      let changed = false;
      if (envKey && (existing.apiKey === "__env__" || existing.apiKey === "" || !existing.apiKey)) {
        existing.apiKey = envKey;
        changed = true;
        synced++;
      }
      // Se o provider tem chave válida e ainda carrega um lastError antigo, limpa
      if (envKey && existing.lastError) {
        existing.lastError = null;
        changed = true;
      }
      if (changed) await persistProvider(existing);
    }

    if (envKey) withKey++;
  }

  if (added > 0) logger.info({ added }, "Novos providers registrados no banco");
  if (synced > 0) logger.info({ synced }, "Chaves de API sincronizadas do env para o banco");

  const activeWithKey = [...providers.values()].filter(p => p.enabled && !!getProviderApiKey(p));
  logger.info({ withKey, activeWithKey: activeWithKey.length }, "Providers prontos");

  if (withKey === 0) {
    logger.warn("Nenhuma variável de ambiente de API configurada. Configure as chaves no servidor.");
  }
}
