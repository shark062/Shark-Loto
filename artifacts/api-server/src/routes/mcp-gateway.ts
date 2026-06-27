import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  LOTTERIES,
  fetchHistoricalDraws,
  computeFrequencies,
} from "../lib/lotteryData";
import { providers, getProviderApiKey, getEffectiveApiKey } from "../lib/aiProviders";
import { logger } from "../lib/logger";

const router = Router();

// ── Regras por modalidade (espelha LOTTERIES, adiciona range) ─────────────────
const LOTTERY_RULES: Record<string, { min: number; max: number; count: number; totalNumbers: number }> = {
  megasena:   { min: 1,  max: 60,  count: 6,  totalNumbers: 60  },
  quina:      { min: 1,  max: 80,  count: 5,  totalNumbers: 80  },
  lotofacil:  { min: 1,  max: 25,  count: 15, totalNumbers: 25  },
  lotomania:  { min: 0,  max: 99,  count: 50, totalNumbers: 100 },
  duplasena:  { min: 1,  max: 50,  count: 6,  totalNumbers: 50  },
  timemania:  { min: 1,  max: 80,  count: 10, totalNumbers: 80  },
  diadesorte: { min: 1,  max: 31,  count: 7,  totalNumbers: 31  },
  supersete:  { min: 0,  max: 9,   count: 7,  totalNumbers: 10  },
};

// ── Tool definitions para o Claude ───────────────────────────────────────────
const mcpTools: Anthropic.Tool[] = [
  {
    name: "fetch_lottery_draws",
    description:
      "Busca resultados REAIS e validados de loterias diretamente da API da Caixa Econômica Federal. " +
      "Use esta ferramenta para obter dados históricos antes de qualquer análise.",
    input_schema: {
      type: "object" as const,
      properties: {
        lottery_id: {
          type: "string",
          enum: Object.keys(LOTTERY_RULES),
          description: "ID da loteria",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 100,
          description: "Quantos últimos sorteios retornar (padrão: 30)",
        },
      },
      required: ["lottery_id"],
    },
  },
  {
    name: "validate_lottery_combination",
    description:
      "Valida se uma combinação de números é válida para uma loteria (quantidade correta, range correto, sem duplicatas).",
    input_schema: {
      type: "object" as const,
      properties: {
        lottery_id: {
          type: "string",
          enum: Object.keys(LOTTERY_RULES),
        },
        numbers: {
          type: "array",
          items: { type: "number" },
          description: "Array de números a validar",
        },
      },
      required: ["lottery_id", "numbers"],
    },
  },
  {
    name: "analyze_frequency",
    description:
      "Calcula a frequência HISTÓRICA de cada número com base em sorteios reais. " +
      "NÃO prediz resultados futuros — apenas descreve o passado.",
    input_schema: {
      type: "object" as const,
      properties: {
        lottery_id: {
          type: "string",
          enum: Object.keys(LOTTERY_RULES),
        },
        limit: {
          type: "number",
          minimum: 5,
          maximum: 100,
          description: "Quantos sorteios analisar (padrão: 30)",
        },
      },
      required: ["lottery_id"],
    },
  },
  {
    name: "compute_statistics",
    description:
      "Computa estatísticas descritivas rigorosas (soma média, paridade, desvio padrão) sobre sorteios reais.",
    input_schema: {
      type: "object" as const,
      properties: {
        lottery_id: {
          type: "string",
          enum: Object.keys(LOTTERY_RULES),
        },
        limit: {
          type: "number",
          minimum: 5,
          maximum: 100,
          description: "Quantos sorteios analisar (padrão: 30)",
        },
      },
      required: ["lottery_id"],
    },
  },
];

// ── Implementações das ferramentas (dados reais da Caixa) ─────────────────────

async function toolFetchLotteryDraws(lotteryId: string, limit = 30): Promise<object> {
  const rules = LOTTERY_RULES[lotteryId];
  if (!rules) {
    return { success: false, error: `Loteria inválida: ${lotteryId}`, valid_lotteries: Object.keys(LOTTERY_RULES) };
  }

  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  const displayName = lottery?.displayName ?? lotteryId;

  try {
    const draws = await fetchHistoricalDraws(lotteryId, limit);

    if (draws.length === 0) {
      return {
        success: false,
        error: "Não foi possível obter sorteios da Caixa no momento. Tente novamente em instantes.",
        lottery_id: lotteryId,
      };
    }

    return {
      success: true,
      lottery_id: lotteryId,
      lottery_name: displayName,
      draws_count: draws.length,
      source: "Caixa Econômica Federal (API oficial)",
      fetched_at: new Date().toISOString(),
      draws: draws.map((numbers, index) => ({
        draw_index: index + 1,
        numbers: [...numbers].sort((a, b) => a - b),
      })),
      note: "Dados históricos reais. Cada sorteio é um evento independente e aleatório.",
    };
  } catch (err: any) {
    return { success: false, error: `Erro ao buscar dados da Caixa: ${err.message}` };
  }
}

function toolValidateCombination(lotteryId: string, numbers: number[]): object {
  const rules = LOTTERY_RULES[lotteryId];
  if (!rules) {
    return { valid: false, error: `Loteria inválida: ${lotteryId}` };
  }

  const errors: string[] = [];

  if (numbers.length !== rules.count) {
    errors.push(`Quantidade incorreta: ${lotteryId} requer ${rules.count} números, recebeu ${numbers.length}`);
  }

  const outOfRange = numbers.filter(n => n < rules.min || n > rules.max);
  if (outOfRange.length > 0) {
    errors.push(`Fora do range [${rules.min}–${rules.max}]: ${outOfRange.join(", ")}`);
  }

  if (new Set(numbers).size !== numbers.length) {
    errors.push("Há números duplicados");
  }

  if (numbers.some(n => !Number.isInteger(n))) {
    errors.push("Todos os números devem ser inteiros");
  }

  return {
    valid: errors.length === 0,
    lottery_id: lotteryId,
    numbers_sorted: [...numbers].sort((a, b) => a - b),
    rules: { range: `${rules.min}–${rules.max}`, count: rules.count },
    errors: errors.length > 0 ? errors : undefined,
  };
}

async function toolAnalyzeFrequency(lotteryId: string, limit = 30): Promise<object> {
  const rules = LOTTERY_RULES[lotteryId];
  if (!rules) return { success: false, error: `Loteria inválida: ${lotteryId}` };

  try {
    const draws = await fetchHistoricalDraws(lotteryId, limit);
    if (draws.length === 0) {
      return { success: false, error: "Sem dados disponíveis no momento" };
    }

    const frequencies = computeFrequencies(rules.totalNumbers, draws);
    const sorted = [...frequencies].sort((a, b) => b.frequency - a.frequency);

    return {
      success: true,
      lottery_id: lotteryId,
      draws_analyzed: draws.length,
      source: "Caixa Econômica Federal",
      frequency_distribution: sorted.map(f => ({
        number: f.number,
        frequency: f.frequency,
        recent_frequency: f.recentFrequency,
        delay: f.delay,
        temperature: f.temperature,
        percentage: f.percentage.toFixed(2) + "%",
      })),
      disclaimer: [
        "⚠️ Frequência HISTÓRICA apenas — NÃO prediz resultados futuros",
        "⚠️ Cada sorteio é independente (RNG certificado)",
        "⚠️ Números 'quentes' ou 'frios' são só padrões históricos, sem valor preditivo",
      ].join("\n"),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function toolComputeStatistics(lotteryId: string, limit = 30): Promise<object> {
  const rules = LOTTERY_RULES[lotteryId];
  if (!rules) return { success: false, error: `Loteria inválida: ${lotteryId}` };

  try {
    const draws = await fetchHistoricalDraws(lotteryId, limit);
    if (draws.length === 0) {
      return { success: false, error: "Sem dados disponíveis" };
    }

    const sums = draws.map(d => d.reduce((a, b) => a + b, 0));
    const evens = draws.map(d => d.filter(n => n % 2 === 0).length);
    const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;
    const avgEvens = evens.reduce((a, b) => a + b, 0) / evens.length;
    const stdDev = Math.sqrt(sums.reduce((s, x) => s + (x - avgSum) ** 2, 0) / sums.length);

    const allNums = draws.flat();
    const avgNumber = allNums.reduce((a, b) => a + b, 0) / allNums.length;

    return {
      success: true,
      lottery_id: lotteryId,
      draws_analyzed: draws.length,
      source: "Caixa Econômica Federal",
      sum_statistics: {
        average: avgSum.toFixed(2),
        min: Math.min(...sums),
        max: Math.max(...sums),
        std_deviation: stdDev.toFixed(2),
      },
      parity_statistics: {
        average_evens_per_draw: avgEvens.toFixed(2),
        average_odds_per_draw: (draws[0]?.length - avgEvens).toFixed(2),
      },
      number_statistics: {
        average_value: avgNumber.toFixed(2),
        min_appeared: Math.min(...allNums),
        max_appeared: Math.max(...allNums),
      },
      note: "Estatísticas descritivas de dados passados — sem valor preditivo.",
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Dispatcher de ferramentas ─────────────────────────────────────────────────

async function dispatchTool(toolName: string, input: any): Promise<string> {
  let result: object;

  switch (toolName) {
    case "fetch_lottery_draws":
      result = await toolFetchLotteryDraws(input.lottery_id, input.limit ?? 30);
      break;
    case "validate_lottery_combination":
      result = toolValidateCombination(input.lottery_id, input.numbers);
      break;
    case "analyze_frequency":
      result = await toolAnalyzeFrequency(input.lottery_id, input.limit ?? 30);
      break;
    case "compute_statistics":
      result = await toolComputeStatistics(input.lottery_id, input.limit ?? 30);
      break;
    default:
      result = { error: `Ferramenta desconhecida: ${toolName}` };
  }

  return JSON.stringify(result);
}

// ── Validação anti-alucinação ─────────────────────────────────────────────────

function validateQuery(query: string): { valid: boolean; error?: string } {
  const suspicious = [
    /\b(garanto|100%|certeza absoluta)\b/i,
    /\bnúmeros que (vão|irão) (sair|cair)\b/i,
    /\b(método secreto|truque infalível|fórmula mágica)\b/i,
    /\b(vou (acertar|ganhar) com certeza)\b/i,
  ];
  for (const p of suspicious) {
    if (p.test(query)) {
      return { valid: false, error: "Consulta contém pedido de garantia ou predição impossível em loterias." };
    }
  }
  return { valid: true };
}

function checkOutput(text: string): { valid: boolean; warning?: string } {
  const forbidden = ["esses números vão sair", "100% de chance", "garanto que", "método infalível", "fórmula secreta"];
  for (const phrase of forbidden) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      return { valid: false, warning: `Frase problemática detectada: "${phrase}"` };
    }
  }
  return { valid: true };
}

// ── Obter client Anthropic (usa chave configurada nos providers) ───────────────

function getAnthropicClient(): Anthropic | null {
  // Tenta env vars (múltiplas variantes de nome) via getEffectiveApiKey
  const fromEnv = getEffectiveApiKey("anthropic");
  if (fromEnv) return new Anthropic({ apiKey: fromEnv });

  // Fallback: chave salva no banco
  for (const p of providers.values()) {
    if (p.type === "anthropic" && p.enabled) {
      const key = getProviderApiKey(p);
      if (key) return new Anthropic({ apiKey: key });
    }
  }

  return null;
}

// ── POST /api/mcp/analyze ─────────────────────────────────────────────────────

router.post("/analyze", async (req: Request, res: Response) => {
  const { query, lottery_id } = req.body as { query?: string; lottery_id?: string };

  if (!query || !lottery_id) {
    res.status(400).json({ error: "Parâmetros obrigatórios: 'query' e 'lottery_id'" });
    return;
  }

  if (!LOTTERY_RULES[lottery_id]) {
    res.status(400).json({
      error: `Loteria inválida: ${lottery_id}`,
      valid_options: Object.keys(LOTTERY_RULES),
    });
    return;
  }

  const queryCheck = validateQuery(query);
  if (!queryCheck.valid) {
    res.status(400).json({ error: queryCheck.error, hint: "Use consultas como: 'qual a frequência do número 7?'" });
    return;
  }

  const client = getAnthropicClient();
  if (!client) {
    res.status(503).json({
      success: false,
      error: "Chave da API Anthropic não configurada. Adicione ANTHROPIC_API_KEY nos segredos do projeto.",
    });
    return;
  }

  const lottery = LOTTERIES.find(l => l.id === lottery_id);
  const lotteryName = lottery?.displayName ?? lottery_id;

  const systemPrompt = `Você é um ANALISTA DE LOTERIAS honesto e científico trabalhando com dados REAIS da Caixa Econômica Federal.

REGRAS ABSOLUTAS:
1. Use APENAS as ferramentas MCP fornecidas para obter dados — nunca invente números
2. NUNCA faça predições de resultados futuros — isso é matematicamente impossível
3. SEMPRE cite a fonte dos dados ("Caixa Econômica Federal")
4. Use linguagem precisa: "frequência histórica", não "número que vai sair"
5. Inclua disclaimer sobre a aleatoriedade de loterias
6. Se os dados não estiverem disponíveis, informe claramente

Você analisa: ${lotteryName} (${lottery_id})
Seu trabalho: Análises honestas de dados históricos. Você não pode prever o futuro.`;

  try {
    let messages: Anthropic.MessageParam[] = [
      { role: "user", content: `${query} (Loteria: ${lotteryName})` },
    ];

    let response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1200,
      system: systemPrompt,
      tools: mcpTools,
      messages,
    });

    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 3) {
      iterations++;
      const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolBlocks) {
        const result = await dispatchTool(tb.name, tb.input);
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
      }

      messages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1200,
        system: systemPrompt,
        tools: mcpTools,
        messages,
      });
    }

    const finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("\n");

    const outputCheck = checkOutput(finalText);
    if (!outputCheck.valid) {
      logger.warn({ warning: outputCheck.warning }, "MCP: output validation warning");
    }

    res.json({
      success: true,
      query,
      lottery_id,
      lottery_name: lotteryName,
      analysis: finalText,
      metadata: {
        source: "MCP Gateway — dados reais da Caixa Econômica Federal",
        validation: outputCheck.valid ? "ok" : "warning",
        model: "claude-3-5-haiku-20241022",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "MCP analyze error");
    res.status(500).json({
      success: false,
      error: "Erro na análise MCP",
      details: process.env.NODE_ENV === "development" ? err.message : "Erro interno",
    });
  }
});

// ── GET /api/mcp/health ───────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  const hasKey = !!getAnthropicClient();
  res.json({
    status: hasKey ? "ok" : "degraded",
    mcp_gateway: "operational",
    anthropic_key_configured: hasKey,
    tools_available: mcpTools.length,
    tools: mcpTools.map(t => t.name),
    lotteries_supported: Object.keys(LOTTERY_RULES),
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/mcp/data/:lotteryId — endpoint de dados sem LLM ─────────────────

router.get("/data/:lotteryId", async (req: Request, res: Response) => {
  const { lotteryId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

  if (!LOTTERY_RULES[lotteryId]) {
    res.status(400).json({ error: `Loteria inválida: ${lotteryId}`, valid_options: Object.keys(LOTTERY_RULES) });
    return;
  }

  try {
    const rules = LOTTERY_RULES[lotteryId];
    const lottery = LOTTERIES.find(l => l.id === lotteryId);
    const draws = await fetchHistoricalDraws(lotteryId, limit);

    if (draws.length === 0) {
      res.status(503).json({ error: "Dados indisponíveis no momento. Tente em instantes." });
      return;
    }

    const frequencies = computeFrequencies(rules.totalNumbers, draws);
    const sorted = [...frequencies].sort((a, b) => b.frequency - a.frequency);

    const sums = draws.map(d => d.reduce((a, b) => a + b, 0));
    const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;

    res.json({
      lottery_id: lotteryId,
      lottery_name: lottery?.displayName ?? lotteryId,
      draws_analyzed: draws.length,
      source: "Caixa Econômica Federal",
      top_frequent: sorted.slice(0, 10).map(f => ({ number: f.number, frequency: f.frequency, temperature: f.temperature })),
      least_frequent: sorted.slice(-10).reverse().map(f => ({ number: f.number, frequency: f.frequency, temperature: f.temperature })),
      avg_sum: Math.round(avgSum),
      recent_draws: draws.slice(0, 5).map((d, i) => ({ index: i + 1, numbers: [...d].sort((a, b) => a - b) })),
      disclaimer: "Dados históricos reais. Frequência passada NÃO prediz resultados futuros.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
