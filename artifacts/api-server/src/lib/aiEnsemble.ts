import { logger } from "./logger";
import { providers, evolutionLog, recalcPriorities, getEffectiveApiKey, getProviderApiKey } from "./aiProviders";
import type { ProviderConfig } from "./aiProviders";
import {
  classifyHttpError,
  classifyNetworkError,
  recordSuccess,
  recordFailure,
  isAvailable,
  sleep,
} from "./aiHealthManager";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderRole =
  | "frequency_analyst"
  | "statistical_predictor"
  | "mathematical_analyzer"
  | "pattern_recognizer"
  | "strategy_advisor"
  | "ensemble_judge";

export interface DrawData {
  contestNumber: number;
  numbers: number[];
}

export interface LotteryContext {
  lotteryId: string;
  lotteryName: string;
  totalNumbers: number;
  minNumbers: number;
  draws: DrawData[];
  hotNumbers: number[];
  coldNumbers: number[];
  warmNumbers: number[];
  frequencyMap: Record<number, number>;
  avgSum: number;
  avgEvens: number;
}

export interface ProviderResult {
  providerId: string;
  providerName: string;
  role: ProviderRole;
  suggestedNumbers: number[];
  confidence: number;
  reasoning: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  extras?: Record<string, any>;
}

export interface EnsembleResult {
  consensusNumbers: number[];
  alternativeGames: Array<{ numbers: number[]; source: string; confidence: number }>;
  providerResults: ProviderResult[];
  consensusScore: Record<number, number>;
  overallConfidence: number;
  reasoning: string;
  successfulProviders: number;
  totalProviders: number;
  latencyMs: number;
}

// ─── Resumo estatístico compacto (substitui histórico bruto) ─────────────────
// Reduz tokens enviados às IAs: em vez do histórico completo, envia estatísticas
// por dezena dos últimos 20 concursos.

interface NumberStat {
  n: number;
  freq: number;
  delay: number;
  trend: "hot" | "warm" | "cold";
  recentAppearances: number; // últimos 5 sorteios
}

function buildNumberStats(ctx: LotteryContext, draws: DrawData[]): NumberStat[] {
  const recent = draws.slice(0, 20);
  const last5 = draws.slice(0, 5);

  const stats: NumberStat[] = [];
  for (let n = 1; n <= ctx.totalNumbers; n++) {
    const freq = recent.filter(d => d.numbers.includes(n)).length;
    const recentAppearances = last5.filter(d => d.numbers.includes(n)).length;
    // Atraso: quantos sorteios desde a última aparição
    let delay = 0;
    for (let i = 0; i < recent.length; i++) {
      if (recent[i].numbers.includes(n)) break;
      delay++;
    }
    const trend = ctx.hotNumbers.includes(n) ? "hot"
      : ctx.coldNumbers.includes(n) ? "cold" : "warm";
    stats.push({ n, freq, delay, trend, recentAppearances });
  }
  return stats;
}

function formatCompactStats(stats: NumberStat[]): string {
  // Formato compacto: n:freq/delay/trend
  return stats.map(s => `${s.n}:${s.freq}/${s.delay}/${s.trend[0]}`).join(" ");
}

// ─── System prompts por role — versão compacta (< tokens) ────────────────────

const ROLE_PROMPTS: Record<ProviderRole, (ctx: LotteryContext, draws20: DrawData[]) => string> = {
  frequency_analyst: (ctx, draws20) => {
    const stats = buildNumberStats(ctx, draws20);
    const compactStats = formatCompactStats(stats);
    const last5 = draws20.slice(0, 5).map(d => `[${d.numbers.sort((a,b)=>a-b).join(",")}]`).join(" ");
    return `Analista de frequência — ${ctx.lotteryName}. Escolher ${ctx.minNumbers} de ${ctx.totalNumbers} números.

Estatísticas (formato n:freq/atraso/trend): ${compactStats}
Últimos 5: ${last5}
Quentes: ${ctx.hotNumbers.slice(0, 8).join(",")} | Frios: ${ctx.coldNumbers.slice(0, 8).join(",")}
Soma média: ${ctx.avgSum.toFixed(0)} | Pares médios: ${ctx.avgEvens.toFixed(1)}

Use retorno à média: frios tendem a aparecer, quentes a pausar.
Responda APENAS JSON: {"suggestedNumbers":[${ctx.minNumbers} números 1-${ctx.totalNumbers}],"confidence":0.XX,"reasoning":"curto"}`;
  },

  statistical_predictor: (ctx, draws20) => {
    const last8 = draws20.slice(0, 8).map(d => {
      const s = d.numbers.reduce((a,b)=>a+b,0);
      const e = d.numbers.filter(n=>n%2===0).length;
      return `[${d.numbers.sort((a,b)=>a-b).join(",")}] s=${s} p=${e}`;
    }).join(" | ");
    return `Preditor estatístico — ${ctx.lotteryName}. Escolher ${ctx.minNumbers} de ${ctx.totalNumbers}.

Últimos 8 sorteios (s=soma,p=pares): ${last8}
Meta: soma≈${ctx.avgSum.toFixed(0)}, pares≈${ctx.avgEvens.toFixed(0)}
Quentes: ${ctx.hotNumbers.slice(0,8).join(",")} | Frios: ${ctx.coldNumbers.slice(0,8).join(",")}

Critérios: frequência ponderada por recência, equilíbrio par/ímpar, evitar 3+ consecutivos.
Responda APENAS JSON: {"suggestedNumbers":[${ctx.minNumbers} números distintos 1-${ctx.totalNumbers}],"confidence":0.XX,"reasoning":"curto","expectedSum":N}`;
  },

  mathematical_analyzer: (ctx, draws20) => {
    const last10 = draws20.slice(0, 10).map(d => {
      const sorted = [...d.numbers].sort((a,b)=>a-b);
      const sum = sorted.reduce((a,b)=>a+b,0);
      const evens = sorted.filter(n=>n%2===0).length;
      const consec = sorted.reduce((c,n,i,arr) => i>0 && n===arr[i-1]+1 ? c+1 : c, 0);
      return `[${sorted.join(",")}] s=${sum} p=${evens} c=${consec}`;
    }).join("\n");
    return `Analisador matemático — ${ctx.lotteryName}. Escolher ${ctx.minNumbers} de ${ctx.totalNumbers}.

Últimos 10 (s=soma,p=pares,c=consecutivos):
${last10}
Soma média: ${ctx.avgSum.toFixed(1)} | Pares médios: ${ctx.avgEvens.toFixed(1)}

Analise padrão de soma ideal, equilíbrio par/ímpar, distribuição faixas.
Responda APENAS JSON: {"suggestedNumbers":[${ctx.minNumbers} números distintos 1-${ctx.totalNumbers}],"confidence":0.XX,"reasoning":"curto","targetSum":N}`;
  },

  pattern_recognizer: (ctx, draws20) => {
    // Limitado a 20 sorteios, números ordenados
    const history = draws20.slice(0, 20).map((d, i) =>
      `#${i+1}:[${[...d.numbers].sort((a,b)=>a-b).join(",")}]`
    ).join(" ");
    const neverSeen = Array.from({length: ctx.totalNumbers}, (_,i)=>i+1)
      .filter(n => !Object.keys(ctx.frequencyMap).some(k => parseInt(k) === n && ctx.frequencyMap[parseInt(k)] > 0))
      .join(",") || "nenhum";
    return `Reconhecedor de padrões — ${ctx.lotteryName}. Escolher ${ctx.minNumbers} de ${ctx.totalNumbers}.

Histórico 20 sorteios: ${history}
Ausentes: ${neverSeen}
Frios (mais atrasados): ${ctx.coldNumbers.slice(0,8).join(",")}

Analise co-ocorrências, ciclos, padrões posicionais.
Responda APENAS JSON: {"suggestedNumbers":[${ctx.minNumbers} números distintos 1-${ctx.totalNumbers}],"confidence":0.XX,"reasoning":"curto"}`;
  },

  strategy_advisor: (ctx, draws20) => {
    const last5 = draws20.slice(0, 5).map(d=>`[${d.numbers.sort((a,b)=>a-b).join(",")}]`).join(" ");
    return `Conselheiro estratégico — ${ctx.lotteryName}. Escolher ${ctx.minNumbers} de ${ctx.totalNumbers}.

Quentes: ${ctx.hotNumbers.join(",")} | Frios: ${ctx.coldNumbers.join(",")}
Soma média: ${ctx.avgSum.toFixed(1)} | Pares médios: ${ctx.avgEvens.toFixed(1)}
Últimos 5: ${last5}

Equilibre frequência, aleatoriedade e diversificação.
Responda APENAS JSON: {"suggestedNumbers":[${ctx.minNumbers} números distintos 1-${ctx.totalNumbers}],"confidence":0.XX,"reasoning":"curto","strategy":"nome"}`;
  },

  ensemble_judge: (ctx, _draws20) => `Juiz do ensemble — ${ctx.lotteryName}. Escolher ${ctx.minNumbers} de ${ctx.totalNumbers}.

Quentes: ${ctx.hotNumbers.join(",")} | Frios: ${ctx.coldNumbers.join(",")}
Soma média: ${ctx.avgSum.toFixed(1)} | Pares médios: ${ctx.avgEvens.toFixed(1)}

Combine as análises: priorize números sugeridos por múltiplos especialistas, equilíbrio matemático, mix quentes/frios.
Responda APENAS JSON: {"suggestedNumbers":[${ctx.minNumbers} números distintos 1-${ctx.totalNumbers}],"confidence":0.XX,"reasoning":"síntese do consenso"}`,
};

// ─── Role assignment por tipo de provider ─────────────────────────────────────

const PROVIDER_ROLES: Record<string, ProviderRole> = {
  groq:        "frequency_analyst",
  openai:      "statistical_predictor",
  deepseek:    "mathematical_analyzer",
  gemini:      "pattern_recognizer",
  anthropic:   "strategy_advisor",
  openrouter:  "ensemble_judge",
  mistral:     "statistical_predictor",
  cohere:      "pattern_recognizer",
  together:    "frequency_analyst",
  custom:      "frequency_analyst",
};

// Peso por role no consenso
const ROLE_WEIGHT: Record<ProviderRole, number> = {
  ensemble_judge:        1.8,
  strategy_advisor:      1.5,
  statistical_predictor: 1.4,
  mathematical_analyzer: 1.3,
  pattern_recognizer:    1.2,
  frequency_analyst:     1.1,
};

// ─── Fila de concorrência global ──────────────────────────────────────────────
// Limita chamadas simultâneas: máx 2 por provider, máx 4 globais

class ConcurrencyQueue {
  private globalSlots: number;
  private perProviderSlots: Map<string, number>;
  private maxPerProvider: number;
  private queue: Array<() => void> = [];

  constructor(globalMax: number, maxPerProvider: number) {
    this.globalSlots = globalMax;
    this.perProviderSlots = new Map();
    this.maxPerProvider = maxPerProvider;
  }

  async acquire(providerId: string): Promise<void> {
    while (
      this.globalSlots <= 0 ||
      (this.perProviderSlots.get(providerId) ?? 0) >= this.maxPerProvider
    ) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.globalSlots--;
    this.perProviderSlots.set(providerId, (this.perProviderSlots.get(providerId) ?? 0) + 1);
  }

  release(providerId: string): void {
    this.globalSlots++;
    const current = this.perProviderSlots.get(providerId) ?? 1;
    this.perProviderSlots.set(providerId, Math.max(0, current - 1));
    const next = this.queue.shift();
    if (next) next();
  }
}

const concurrencyQueue = new ConcurrencyQueue(4, 2);

// ─── HTTP call por provider com controle de concorrência ──────────────────────

async function callProvider(
  provider: ProviderConfig,
  prompt: string,
): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now();

  const apiKey = getProviderApiKey(provider) ?? getEffectiveApiKey(provider.type);
  if (!apiKey) throw new Error(`Chave não configurada para ${provider.type}`);

  await concurrencyQueue.acquire(provider.id);
  let response: Response;
  try {
    if (provider.type === "anthropic") {
      response = await fetch(`${provider.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(25000),
      });
    } else {
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider.type === "openrouter" ? { "HTTP-Referer": "https://lotoshark.app", "X-Title": "LotoShark" } : {}),
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 600,
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
          ...(provider.type === "deepseek" ? { stream: false } : {}),
        }),
        signal: AbortSignal.timeout(25000),
      });
    }
  } finally {
    concurrencyQueue.release(provider.id);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const errInfo = classifyHttpError(response.status, body);
    const err = new Error(`HTTP ${response.status}: ${errInfo.message}`);
    (err as any).body = body;
    throw err;
  }

  const data = await response.json() as any;
  const latencyMs = Date.now() - start;
  const text = provider.type === "anthropic"
    ? (data.content?.[0]?.text || "")
    : (data.choices?.[0]?.message?.content || "");

  const tokens = provider.type === "anthropic"
    ? data.usage?.output_tokens
    : data.usage?.completion_tokens;

  logger.info({
    provider: provider.name,
    model: provider.model,
    latencyMs,
    tokens: tokens ?? "?",
    status: "success",
  }, "Ensemble: provider respondeu");

  return { text, latencyMs };
}

// ─── Parse helpers ────────────────────────────────────────────────────────────

function parseNumbers(text: string, min: number, max: number, count: number): number[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const nums = parsed.suggestedNumbers || parsed.prediction || parsed.numbers || parsed.consensusNumbers;
      if (Array.isArray(nums)) {
        const valid = nums
          .map(Number)
          .filter(n => !isNaN(n) && n >= 1 && n <= max)
          .filter((n, i, arr) => arr.indexOf(n) === i);
        if (valid.length >= count) return valid.slice(0, count).sort((a, b) => a - b);
      }
    } catch {}
  }
  const found = [...text.matchAll(/\b([0-9]{1,3})\b/g)]
    .map(m => parseInt(m[1]))
    .filter(n => n >= 1 && n <= max)
    .filter((n, i, arr) => arr.indexOf(n) === i);
  return found.slice(0, count).sort((a, b) => a - b);
}

function parseConfidence(text: string): number {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const c = parseFloat(parsed.confidence);
      if (!isNaN(c) && c >= 0 && c <= 1) return c;
    }
  } catch {}
  return 0.6;
}

function parseReasoning(text: string): string {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.reasoning || parsed.rationale || "";
    }
  } catch {}
  return text.slice(0, 200);
}

// ─── Validação matemática de jogo ─────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGame(numbers: number[], ctx: LotteryContext): ValidationResult {
  const errors: string[] = [];
  const sorted = [...numbers].sort((a,b)=>a-b);

  if (numbers.length !== ctx.minNumbers) {
    errors.push(`Quantidade incorreta: ${numbers.length} (esperado ${ctx.minNumbers})`);
  }

  const outOfRange = sorted.filter(n => n < 1 || n > ctx.totalNumbers);
  if (outOfRange.length > 0) {
    errors.push(`Fora do range 1-${ctx.totalNumbers}: ${outOfRange.join(",")}`);
  }

  if (new Set(numbers).size !== numbers.length) {
    errors.push("Números duplicados");
  }

  // Verificar equilíbrio par/ímpar (tolerância ±4 da média)
  const evens = sorted.filter(n => n % 2 === 0).length;
  const expectedEvens = Math.round(ctx.avgEvens);
  if (Math.abs(evens - expectedEvens) > 4) {
    errors.push(`Equilíbrio par/ímpar desfavorável: ${evens} pares (média: ${expectedEvens})`);
  }

  // Verificar soma (tolerância ±15% da média)
  if (sorted.length > 0 && ctx.avgSum > 0) {
    const sum = sorted.reduce((a,b)=>a+b,0);
    const tolerance = ctx.avgSum * 0.20;
    if (Math.abs(sum - ctx.avgSum) > tolerance) {
      errors.push(`Soma ${sum} muito distante da média ${ctx.avgSum.toFixed(0)} (tolerância ±${tolerance.toFixed(0)})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Executor de task com retry para 429 ──────────────────────────────────────

async function executeWithRetry(
  provider: ProviderConfig,
  prompt: string,
  role: ProviderRole,
): Promise<ProviderResult> {
  const start = Date.now();
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { text, latencyMs } = await callProvider(provider, prompt);
      const suggestedNumbers = parseNumbers(text, 1, provider.model ? 100 : 100, 0); // parse with raw text
      // Re-parse properly with ctx bounds (done below)
      return {
        providerId: provider.id,
        providerName: provider.name,
        role,
        suggestedNumbers,
        confidence: parseConfidence(text),
        reasoning: parseReasoning(text),
        latencyMs,
        success: true,
        extras: { rawText: text },
      };
    } catch (err: any) {
      const statusMatch = err.message?.match(/^HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const body = err.body || err.message || "";

      const errInfo = status > 0
        ? classifyHttpError(status, body)
        : classifyNetworkError(err);

      // Erros permanentes — não tenta de novo
      if (errInfo.isPermanent) {
        recordFailure(provider.id, provider.name, errInfo);
        logger.warn({
          provider: provider.name, role, attempt,
          error: errInfo.errorClass, message: errInfo.message,
        }, "Ensemble: erro permanente, não tenta novamente");
        return {
          providerId: provider.id, providerName: provider.name, role,
          suggestedNumbers: [], confidence: 0, reasoning: "", latencyMs: Date.now() - start,
          success: false, error: errInfo.message,
        };
      }

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 8000);
        logger.info({
          provider: provider.name, attempt, delayMs: delay, errorClass: errInfo.errorClass,
        }, "Ensemble: retry com backoff");
        await sleep(delay);
        continue;
      }

      recordFailure(provider.id, provider.name, errInfo);
      logger.warn({ provider: provider.name, role, err: err.message }, "Ensemble: provider falhou após retries");
      return {
        providerId: provider.id, providerName: provider.name, role,
        suggestedNumbers: [], confidence: 0, reasoning: "", latencyMs: Date.now() - start,
        success: false, error: err.message,
      };
    }
  }

  // Fallback (nunca deve chegar aqui)
  return {
    providerId: provider.id, providerName: provider.name, role,
    suggestedNumbers: [], confidence: 0, reasoning: "", latencyMs: Date.now() - start,
    success: false, error: "Máximo de tentativas atingido",
  };
}

// ─── Ensemble principal — execução em fases ───────────────────────────────────

export async function runEnsemble(ctx: LotteryContext): Promise<EnsembleResult> {
  const ensembleStart = Date.now();
  const GLOBAL_TIMEOUT_MS = 60_000;

  // Limitar histórico a 20 sorteios
  const draws20 = ctx.draws.slice(0, 20);

  // Providers disponíveis e com chave
  const allProviders = [...providers.values()].filter(p =>
    p.enabled && !!getProviderApiKey(p) && isAvailable(p.id, p.name)
  );

  if (allProviders.length === 0) {
    throw new Error("Nenhum provider de IA configurado ou disponível");
  }

  // Roles prioritários para fase 1
  const PHASE1_ROLES: ProviderRole[] = ["frequency_analyst", "statistical_predictor", "pattern_recognizer"];
  const PHASE2_ROLES: ProviderRole[] = ["mathematical_analyzer", "strategy_advisor"];
  const JUDGE_ROLE: ProviderRole = "ensemble_judge";

  // Atribuir roles
  const assignments = allProviders.map(p => ({
    provider: p,
    role: PROVIDER_ROLES[p.type] ?? "frequency_analyst" as ProviderRole,
  }));

  // ── FASE 1: Especialistas prioritários ────────────────────────────────────
  const phase1 = assignments.filter(a => PHASE1_ROLES.includes(a.role));
  const phase2 = assignments.filter(a => PHASE2_ROLES.includes(a.role));
  const judges = assignments.filter(a => a.role === JUDGE_ROLE);

  logger.info({
    phase1: phase1.length, phase2: phase2.length, judges: judges.length,
    total: allProviders.length,
  }, "Ensemble: iniciando execução em fases");

  const allResults: ProviderResult[] = [];
  const timeoutAt = ensembleStart + GLOBAL_TIMEOUT_MS;

  // Executar fase 1 em paralelo (controlado pela fila)
  if (Date.now() < timeoutAt) {
    const phase1Tasks = phase1.map(({ provider, role }) => {
      const prompt = ROLE_PROMPTS[role](ctx, draws20);
      return executeWithRetry(provider, prompt, role).then(result => {
        // Re-parse numbers com bounds corretos
        if (result.success && result.extras?.rawText) {
          result.suggestedNumbers = parseNumbers(
            result.extras.rawText, 1, ctx.totalNumbers, ctx.minNumbers
          );
          result.success = result.suggestedNumbers.length >= ctx.minNumbers;
        }
        return result;
      });
    });

    const phase1Results = await Promise.all(phase1Tasks);
    allResults.push(...phase1Results);

    // Verificar confiança — se alta (>= 0.75 com 2+ acertos), encerra aqui
    const phase1Success = phase1Results.filter(r => r.success);
    const phase1AvgConf = phase1Success.length > 0
      ? phase1Success.reduce((s,r)=>s+r.confidence,0) / phase1Success.length
      : 0;

    if (phase1Success.length >= 2 && phase1AvgConf >= 0.75) {
      logger.info({ successCount: phase1Success.length, avgConfidence: phase1AvgConf.toFixed(2) },
        "Ensemble: confiança alta na fase 1, pulando fase 2");
    } else if (Date.now() < timeoutAt) {
      // ── FASE 2: Especialistas complementares ───────────────────────────────
      const phase2Tasks = phase2.map(({ provider, role }) => {
        const prompt = ROLE_PROMPTS[role](ctx, draws20);
        return executeWithRetry(provider, prompt, role).then(result => {
          if (result.success && result.extras?.rawText) {
            result.suggestedNumbers = parseNumbers(
              result.extras.rawText, 1, ctx.totalNumbers, ctx.minNumbers
            );
            result.success = result.suggestedNumbers.length >= ctx.minNumbers;
          }
          return result;
        });
      });

      const phase2Results = await Promise.all(phase2Tasks);
      allResults.push(...phase2Results);
    }
  }

  // ── FASE 3: Juiz final ────────────────────────────────────────────────────
  const successSoFar = allResults.filter(r => r.success);
  if (judges.length > 0 && Date.now() < timeoutAt) {
    const judge = judges[0];
    const prompt = ROLE_PROMPTS[JUDGE_ROLE](ctx, draws20);
    const judgeResult = await executeWithRetry(judge.provider, prompt, JUDGE_ROLE);
    if (judgeResult.success && judgeResult.extras?.rawText) {
      judgeResult.suggestedNumbers = parseNumbers(
        judgeResult.extras.rawText, 1, ctx.totalNumbers, ctx.minNumbers
      );
      judgeResult.success = judgeResult.suggestedNumbers.length >= ctx.minNumbers;
    }
    allResults.push(judgeResult);
  }

  // ── Atualizar métricas dos providers ─────────────────────────────────────
  for (const result of allResults) {
    const provider = providers.get(result.providerId);
    if (!provider) continue;
    provider.totalCalls++;
    if (result.success) {
      provider.successCalls++;
      provider.avgLatencyMs = Math.round(provider.avgLatencyMs * 0.8 + result.latencyMs * 0.2);
      provider.lastUsed = new Date().toISOString();
      recordSuccess(provider.id, provider.name, result.latencyMs);
    }
    provider.successRate = provider.successCalls / Math.max(provider.totalCalls, 1);
    provider.lastError = result.error ?? provider.lastError;
    evolutionLog.unshift({
      providerName: provider.name,
      action: result.success ? "success" : "error",
      latencyMs: result.latencyMs,
      details: result.success ? `role:${result.role}` : result.error?.slice(0, 60),
      timestamp: new Date().toISOString(),
    });
  }

  recalcPriorities();

  // ── Consenso ponderado ────────────────────────────────────────────────────
  const successfulResults = allResults.filter(r => r.success && r.suggestedNumbers.length >= ctx.minNumbers);

  const numberScores: Record<number, number> = {};
  for (let n = 1; n <= ctx.totalNumbers; n++) numberScores[n] = 0;

  for (const result of successfulResults) {
    const provider = providers.get(result.providerId);
    const perfWeight = provider ? Math.max(provider.successRate, 0.5) : 0.7;
    const weight = ROLE_WEIGHT[result.role] * perfWeight * result.confidence;
    for (const num of result.suggestedNumbers) {
      numberScores[num] = (numberScores[num] || 0) + weight;
    }
  }

  const ranked = Object.entries(numberScores)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([n, score]) => ({ number: parseInt(n), score: Number(score) }));

  let consensusNumbers = ranked
    .slice(0, ctx.minNumbers)
    .map(r => r.number)
    .sort((a, b) => a - b);

  // Fill com fallback estatístico se necessário
  if (consensusNumbers.length < ctx.minNumbers) {
    const hot = ctx.hotNumbers.filter(n => !consensusNumbers.includes(n));
    while (consensusNumbers.length < ctx.minNumbers && hot.length > 0) {
      consensusNumbers.push(hot.shift()!);
    }
    consensusNumbers.sort((a, b) => a - b);
  }

  // ── Validação matemática ──────────────────────────────────────────────────
  const validation = validateGame(consensusNumbers, ctx);
  if (!validation.valid) {
    logger.warn({ errors: validation.errors }, "Ensemble: jogo consenso falhou validação — aplicando correção");
    // Correção automática: refazer seleção com critérios matemáticos
    const evensNeeded = Math.round(ctx.avgEvens);
    const targetSum = Math.round(ctx.avgSum);
    const allNums = Array.from({length: ctx.totalNumbers}, (_,i)=>i+1);
    const sorted = [...allNums].sort((a,b) => (numberScores[b]||0) - (numberScores[a]||0));
    const corrected: number[] = [];
    let evens = 0;
    for (const n of sorted) {
      if (corrected.length >= ctx.minNumbers) break;
      if (n % 2 === 0 && evens < evensNeeded + 2) { corrected.push(n); evens++; }
      else if (n % 2 !== 0 && (corrected.length - evens) < (ctx.minNumbers - evensNeeded) + 2) { corrected.push(n); }
    }
    while (corrected.length < ctx.minNumbers) {
      const missing = sorted.find(n => !corrected.includes(n));
      if (missing) corrected.push(missing);
      else break;
    }
    consensusNumbers = corrected.slice(0, ctx.minNumbers).sort((a,b)=>a-b);
    logger.info({ corrected: consensusNumbers }, "Ensemble: correção automática aplicada");
  }

  const overallConfidence = successfulResults.length > 0
    ? successfulResults.reduce((s, r) => s + r.confidence, 0) / successfulResults.length
    : 0;

  const alternativeGames = successfulResults
    .slice(0, 5)
    .map(r => ({
      numbers: r.suggestedNumbers,
      source: `${r.providerName} (${r.role.replace(/_/g, " ")})`,
      confidence: r.confidence,
    }));

  const ensembleReasoning = successfulResults.length > 0
    ? `Ensemble de ${successfulResults.length} IAs: ${successfulResults.map(r=>r.providerName).join(", ")}. ` +
      `Votação ponderada por especialidade e desempenho histórico.`
    : "Análise estatística (providers indisponíveis)";

  const latencyMs = Date.now() - ensembleStart;
  logger.info({
    successfulProviders: successfulResults.length,
    totalProviders: allProviders.length,
    latencyMs,
    overallConfidence: overallConfidence.toFixed(2),
    consensusNumbers,
  }, "Ensemble: concluído");

  return {
    consensusNumbers,
    alternativeGames,
    providerResults: allResults,
    consensusScore: numberScores,
    overallConfidence: parseFloat(overallConfidence.toFixed(3)),
    reasoning: ensembleReasoning,
    successfulProviders: successfulResults.length,
    totalProviders: allProviders.length,
    latencyMs,
  };
}

// ─── Single call with fallback chain ─────────────────────────────────────────

export async function callWithFallback(
  prompt: string,
  systemPrompt: string,
  preferredRole?: ProviderRole
): Promise<{ text: string; provider: string }> {
  const allProviders = [...providers.values()]
    .filter(p => p.enabled && !!getProviderApiKey(p) && isAvailable(p.id, p.name))
    .sort((a, b) => {
      if (preferredRole) {
        const roleA = PROVIDER_ROLES[a.type] === preferredRole ? 1 : 0;
        const roleB = PROVIDER_ROLES[b.type] === preferredRole ? 1 : 0;
        if (roleA !== roleB) return roleB - roleA;
      }
      return a.priority - b.priority;
    });

  for (const provider of allProviders) {
    try {
      let fullPrompt = prompt;
      if (systemPrompt && provider.type !== "anthropic") {
        fullPrompt = `${systemPrompt}\n\n${prompt}`;
      }
      const { text } = await callProvider(provider, fullPrompt);
      if (text) {
        provider.totalCalls++;
        provider.successCalls++;
        provider.successRate = provider.successCalls / provider.totalCalls;
        provider.lastUsed = new Date().toISOString();
        recordSuccess(provider.id, provider.name, 0);
        evolutionLog.unshift({ providerName: provider.name, action: "success", details: "fallback call", timestamp: new Date().toISOString() });
        return { text, provider: provider.name };
      }
    } catch (err: any) {
      const statusMatch = err.message?.match(/^HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const body = err.body || err.message || "";
      const errInfo = status > 0 ? classifyHttpError(status, body) : classifyNetworkError(err);
      recordFailure(provider.id, provider.name, errInfo);
      provider.totalCalls++;
      provider.successRate = provider.successCalls / provider.totalCalls;
      provider.lastError = err.message;
      evolutionLog.unshift({ providerName: provider.name, action: "error", details: err.message?.slice(0, 80), timestamp: new Date().toISOString() });
      logger.warn({ provider: provider.name }, "Fallback: tentando próximo provider");
    }
  }
  throw new Error("Todos os providers falharam");
}
