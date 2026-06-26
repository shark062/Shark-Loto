import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import aiProvidersRouter from "./routes/aiProviders";
import aiAnalysisRouter from "./routes/aiAnalysis";
import predictionRouter from "./routes/prediction";
import chatRouter from "./routes/chat";
import mcpGatewayRouter from "./routes/mcp-gateway";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import { initDefaultProviders, listProviders } from "./lib/aiProviders";
import { LOTTERIES, fetchHistoricalDraws, computeFrequencies } from "./lib/lotteryData";
import { runEnsemble } from "./lib/aiEnsemble";
import type { LotteryContext } from "./lib/aiEnsemble";

const app: Express = express();

// ── Segurança: cabeçalhos HTTP ─────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// ── Logging ────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/,
  /\.onrender\.com$/,
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.repl\.co$/,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(pattern =>
      typeof pattern === "string" ? pattern === origin : pattern.test(origin)
    );
    callback(null, allowed ? origin : false);
  },
  credentials: true,
}));

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// ── Rate limits ────────────────────────────────────────────────

// Geral: 120 req/min por IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em instantes." },
});

// IA / predição: 30 req/min (custoso)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de requisições de IA atingido. Aguarde 1 minuto." },
});

// MCP Gateway: 15 req/min (chamadas ao Claude com tools)
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite do MCP Gateway atingido. Aguarde 1 minuto." },
});

// Geração de jogos: 30 req/min
const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de geração de jogos atingido. Aguarde 1 minuto." },
});

app.use("/api", generalLimiter);
app.use("/api/ai",          aiLimiter);
app.use("/api/chat",        aiLimiter);
app.use("/api/mcp",         mcpLimiter);
app.use("/api/prediction",  gameLimiter);
app.use("/api/user/games",  gameLimiter);

// ── Core routes ───────────────────────────────────────────────
app.use("/api", router);

// ── AI routes ─────────────────────────────────────────────────
app.use("/api/ai-providers", aiProvidersRouter);
app.use("/api/ai",           aiAnalysisRouter);
app.use("/api/prediction",   predictionRouter);
app.use("/api/chat",         chatRouter);
app.use("/api/mcp",          mcpGatewayRouter);
app.use("/api/admin",        adminRouter);

// ── Meta-reasoning routes (alias for AIMetrics page) ─────────
function buildCtx(lotteryId: string, lottery: any, draws: number[][]): LotteryContext {
  const freqs = computeFrequencies(lottery.totalNumbers, draws);
  const sorted = [...freqs].sort((a, b) => b.frequency - a.frequency);
  const hotCut  = Math.floor(sorted.length * 0.25);
  const coldCut = Math.floor(sorted.length * 0.75);
  const frequencyMap: Record<number, number> = {};
  for (const f of freqs) frequencyMap[f.number] = f.frequency;
  const avgSum = draws.length > 0
    ? draws.reduce((s, d) => s + d.reduce((a, b) => a + b, 0), 0) / draws.length
    : (lottery.totalNumbers + 1) * lottery.minNumbers / 2;
  const avgEvens = draws.length > 0
    ? draws.reduce((s, d) => s + d.filter((n: number) => n % 2 === 0).length, 0) / draws.length
    : lottery.minNumbers / 2;
  return {
    lotteryId, lotteryName: lottery.displayName,
    totalNumbers: lottery.totalNumbers, minNumbers: lottery.minNumbers,
    draws: draws.map((d, i) => ({ contestNumber: i + 1, numbers: d })),
    hotNumbers: sorted.slice(0, hotCut).map(f => f.number),
    coldNumbers: sorted.slice(coldCut).map(f => f.number),
    warmNumbers: sorted.slice(hotCut, coldCut).map(f => f.number),
    frequencyMap, avgSum, avgEvens,
  };
}

app.get("/api/meta-reasoning/analyze/:lotteryId", async (req: Request, res: Response) => {
  const lotteryId = req.params.lotteryId as string;
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  if (!lottery) { res.status(404).json({ message: "Loteria não encontrada" }); return; }
  try {
    const draws = await fetchHistoricalDraws(lotteryId, 20).catch(() => [] as number[][]);
    const ctx = buildCtx(lotteryId, lottery, draws);
    const { providers: pList } = listProviders();
    res.json({
      lotteryId, lotteryName: lottery.displayName, drawsAnalyzed: draws.length,
      rankings: pList.map(p => ({
        modelName: p.name, accuracy: p.successRate, confidence: p.successRate * 0.9,
        successRate: p.successRate, totalPredictions: p.totalCalls,
        avgLatencyMs: p.avgLatencyMs, priority: p.priority,
      })),
      hotNumbers: ctx.hotNumbers.slice(0, 8),
      coldNumbers: ctx.coldNumbers.slice(0, 8),
      avgSum: ctx.avgSum,
    });
  } catch {
    res.status(500).json({ message: "Erro interno ao analisar modalidade." });
  }
});

app.get("/api/meta-reasoning/optimal-combination/:lotteryId", async (req: Request, res: Response) => {
  const lotteryId = req.params.lotteryId as string;
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  if (!lottery) { res.status(404).json({ message: "Loteria não encontrada" }); return; }
  try {
    const draws = await fetchHistoricalDraws(lotteryId, 20).catch(() => [] as number[][]);
    const ctx = buildCtx(lotteryId, lottery, draws);
    const { stats } = listProviders();
    if (stats.active === 0) {
      res.json({ lotteryId, optimalNumbers: ctx.hotNumbers.slice(0, lottery.minNumbers).sort((a, b) => a - b), confidence: 0.55, source: "statistical" }); return;
    }
    const ensemble = await runEnsemble(ctx);
    res.json({
      lotteryId, lotteryName: lottery.displayName,
      optimalNumbers: ensemble.consensusNumbers,
      confidence: ensemble.overallConfidence, source: "ensemble",
      providers: ensemble.successfulProviders,
    });
  } catch {
    res.status(500).json({ message: "Erro interno ao gerar combinação ótima." });
  }
});

app.post("/api/meta-reasoning/feedback", (req: Request, res: Response) => {
  res.json({ success: true, message: "Feedback registrado" });
});

// ── Init (async — roda migrations e carrega providers do banco antes de servir) ──
(async () => {
  try {
    await runMigrations();
    logger.info("Migrations executadas com sucesso");
  } catch (err: any) {
    logger.error({ err: err.message }, "Falha ao executar migrations");
  }
  try {
    await initDefaultProviders();
  } catch (err: any) {
    logger.error({ err: err.message }, "Falha ao inicializar providers");
  }
})();

export default app;
