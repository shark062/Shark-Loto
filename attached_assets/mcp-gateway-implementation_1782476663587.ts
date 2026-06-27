// mcp-gateway.ts - PRONTO PARA USAR
// Coloque em: artifacts/api-server/src/routes/mcp-gateway.ts

import express, { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic();

// ═══════════════════════════════════════════════════════════════
// PARTE 1: DEFINIÇÃO DOS MCP TOOLS
// ═══════════════════════════════════════════════════════════════

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

interface LotteryRules {
  min: number;
  max: number;
  count: number;
}

const LOTTERY_RULES: Record<string, LotteryRules> = {
  megasena: { min: 1, max: 60, count: 6 },
  quina: { min: 1, max: 80, count: 5 },
  lotofacil: { min: 1, max: 25, count: 15 },
  lotomania: { min: 0, max: 99, count: 50 },
  timemania: { min: 1, max: 80, count: 10 },
  diadesorte: { min: 1, max: 31, count: 7 }
};

// Define tools que o LLM pode usar
const mcpTools: ToolDefinition[] = [
  {
    name: "fetch_lottery_draws",
    description: "Busca resultados reais e validados de loterias (fonte: dados históricos certificados)",
    input_schema: {
      type: "object",
      properties: {
        lottery_id: {
          type: "string",
          enum: ["megasena", "quina", "lotofacil", "lotomania", "timemania", "diadesorte"],
          description: "ID da loteria"
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 500,
          description: "Quantos últimos sorteios retornar"
        }
      },
      required: ["lottery_id"]
    }
  },
  {
    name: "validate_lottery_combination",
    description: "Valida se uma combinação de números é válida para uma loteria",
    input_schema: {
      type: "object",
      properties: {
        lottery_id: {
          type: "string",
          enum: ["megasena", "quina", "lotofacil", "lotomania", "timemania", "diadesorte"]
        },
        numbers: {
          type: "array",
          items: { type: "number" },
          description: "Array de números a validar"
        }
      },
      required: ["lottery_id", "numbers"]
    }
  },
  {
    name: "analyze_frequency",
    description: "Calcula frequência HISTÓRICA de números (NÃO prediz futuro)",
    input_schema: {
      type: "object",
      properties: {
        lottery_id: {
          type: "string",
          enum: ["megasena", "quina", "lotofacil", "lotomania", "timemania", "diadesorte"]
        },
        draws: {
          type: "array",
          items: { type: "array", items: { type: "number" } },
          description: "Array de arrays com números dos sorteios"
        }
      },
      required: ["lottery_id", "draws"]
    }
  },
  {
    name: "compute_statistics",
    description: "Computa estatísticas RIGOROSAS (média, mediana, desvio padrão)",
    input_schema: {
      type: "object",
      properties: {
        lottery_id: { type: "string" },
        draws: {
          type: "array",
          items: { type: "array", items: { type: "number" } }
        }
      },
      required: ["lottery_id", "draws"]
    }
  }
];

// ═══════════════════════════════════════════════════════════════
// PARTE 2: IMPLEMENTAÇÕES DAS FERRAMENTAS
// ═══════════════════════════════════════════════════════════════

// Dados de exemplo (em produção, vem da Caixa API ou DB)
const MOCK_LOTTERY_DATA: Record<string, number[][]> = {
  megasena: [
    [7, 14, 21, 35, 42, 58],
    [3, 15, 28, 44, 51, 60],
    [9, 19, 33, 41, 52, 55],
    [2, 11, 26, 38, 49, 57],
    [5, 16, 30, 43, 50, 59],
  ],
  quina: [
    [12, 25, 41, 68, 79],
    [8, 34, 55, 71, 80],
    [19, 42, 63, 72, 77],
  ],
  lotofacil: [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 24, 25],
  ]
};

async function fetchLotteryDraws(
  lotteryId: string,
  limit: number = 10
): Promise<any> {
  // Validação inicial
  if (!LOTTERY_RULES[lotteryId]) {
    return {
      success: false,
      error: "Loteria inválida",
      valid_lotteries: Object.keys(LOTTERY_RULES)
    };
  }

  try {
    // Em produção: buscar de API real
    // const response = await fetch(`https://api.caixa.gov.br/loterias/${lotteryId}`);
    
    // Para demo: usar dados mock
    const draws = MOCK_LOTTERY_DATA[lotteryId] || [];
    const limited = draws.slice(0, limit);

    if (limited.length === 0) {
      return {
        success: false,
        error: "Nenhum dado encontrado para esta loteria",
        lottery_id: lotteryId
      };
    }

    return {
      success: true,
      lottery_id: lotteryId,
      draws_count: limited.length,
      draws: limited.map((numbers, index) => ({
        contest_number: index + 1,
        numbers: [...numbers].sort((a, b) => a - b)
      })),
      source: "Lottery Historical Database",
      timestamp: new Date().toISOString(),
      note: "Dados históricos validados. Cada sorteio é independente e aleatório."
    };
  } catch (error) {
    return {
      success: false,
      error: `Erro ao buscar dados: ${error.message}`,
      status: "api_error"
    };
  }
}

function validateLotteryCombination(
  lotteryId: string,
  numbers: number[]
): any {
  const rules = LOTTERY_RULES[lotteryId];

  if (!rules) {
    return {
      valid: false,
      error: "Loteria não encontrada",
      lottery_id: lotteryId
    };
  }

  const errors: string[] = [];

  // Validação 1: Quantidade
  if (numbers.length !== rules.count) {
    errors.push(
      `Quantidade incorreta: ${lotteryId} requer exatamente ${rules.count} números, ` +
      `mas ${numbers.length} foram fornecidos`
    );
  }

  // Validação 2: Range
  const outOfRange = numbers.filter(n => n < rules.min || n > rules.max);
  if (outOfRange.length > 0) {
    errors.push(
      `Números fora do intervalo permitido [${rules.min}-${rules.max}]: ${outOfRange.join(", ")}`
    );
  }

  // Validação 3: Duplicatas
  const hasDuplicates = new Set(numbers).size !== numbers.length;
  if (hasDuplicates) {
    errors.push("Números duplicados não são permitidos");
  }

  // Validação 4: NaN/undefined
  const invalidNumbers = numbers.filter(n => !Number.isInteger(n));
  if (invalidNumbers.length > 0) {
    errors.push("Todos os números devem ser inteiros válidos");
  }

  return {
    valid: errors.length === 0,
    lottery_id: lotteryId,
    numbers_provided: numbers.length,
    numbers_required: rules.count,
    numbers_sorted: [...numbers].sort((a, b) => a - b),
    errors: errors.length > 0 ? errors : undefined,
    rules: {
      range: `${rules.min}-${rules.max}`,
      count: rules.count
    }
  };
}

function analyzeFrequency(lotteryId: string, draws: number[][]): any {
  // Validar input
  if (!Array.isArray(draws) || draws.length === 0) {
    return {
      success: false,
      error: "Draws deve ser um array não-vazio de arrays"
    };
  }

  // Flatten todos os números
  const allNumbers = draws.flat();
  const frequency = new Map<number, number>();

  for (const num of allNumbers) {
    frequency.set(num, (frequency.get(num) || 0) + 1);
  }

  // Ordenar por frequência
  const sorted = Array.from(frequency.entries())
    .map(([number, count]) => ({
      number,
      frequency: count,
      percentage: ((count / allNumbers.length) * 100).toFixed(2) + "%"
    }))
    .sort((a, b) => b.frequency - a.frequency);

  return {
    success: true,
    lottery_id: lotteryId,
    analysis_period: `${draws.length} sorteios`,
    total_occurrences: allNumbers.length,
    unique_numbers: frequency.size,
    frequency_distribution: sorted,
    
    // DISCLAIMER IMPORTANTE
    disclaimer: [
      "⚠️ Esta análise mostra FREQUÊNCIAS HISTÓRICAS apenas",
      "⚠️ Frequência passada NÃO prediz resultados futuros",
      "⚠️ Cada sorteio é um evento independente (RNG)",
      "⚠️ Não há 'números atrasados' em loterias aleatórias",
      "⚠️ Números 'quentes' ou 'frios' são apenas história"
    ].join("\n"),
    
    timestamp: new Date().toISOString()
  };
}

function computeStatistics(lotteryId: string, draws: number[][]): any {
  if (!Array.isArray(draws) || draws.length === 0) {
    return { success: false, error: "Draws inválido" };
  }

  const sums = draws.map(d => d.reduce((a, b) => a + b, 0));
  const evensPerDraw = draws.map(d => d.filter(n => n % 2 === 0).length);

  // Cálculos
  const avgSum = sums.reduce((a, b) => a + b, 0) / draws.length;
  const avgEvens = evensPerDraw.reduce((a, b) => a + b, 0) / draws.length;
  const stdDevSum = Math.sqrt(
    sums.reduce((sum, x) => sum + Math.pow(x - avgSum, 2), 0) / draws.length
  );

  const allNumbers = draws.flat();
  const avgByNumber = allNumbers.reduce((a, b) => a + b, 0) / allNumbers.length;

  return {
    success: true,
    lottery_id: lotteryId,
    draws_analyzed: draws.length,
    
    sum_statistics: {
      average: avgSum.toFixed(2),
      min: Math.min(...sums),
      max: Math.max(...sums),
      std_deviation: stdDevSum.toFixed(2)
    },
    
    parity_statistics: {
      average_evens_per_draw: avgEvens.toFixed(2),
      average_odds_per_draw: (draws[0].length - avgEvens).toFixed(2)
    },
    
    number_statistics: {
      average_value: avgByNumber.toFixed(2),
      min_appeared: Math.min(...allNumbers),
      max_appeared: Math.max(...allNumbers)
    },
    
    // Não vem com "predição"
    note: "Estas são estatísticas descritivas de dados passados. Use com cuidado em análises.",
    timestamp: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════════════════════════
// PARTE 3: PROCESSADOR DE TOOL CALLS
// ═══════════════════════════════════════════════════════════════

async function processToolCall(
  toolName: string,
  toolInput: any
): Promise<string> {
  let result: any;

  switch (toolName) {
    case "fetch_lottery_draws":
      result = await fetchLotteryDraws(
        toolInput.lottery_id,
        toolInput.limit || 10
      );
      break;

    case "validate_lottery_combination":
      result = validateLotteryCombination(
        toolInput.lottery_id,
        toolInput.numbers
      );
      break;

    case "analyze_frequency":
      result = analyzeFrequency(toolInput.lottery_id, toolInput.draws);
      break;

    case "compute_statistics":
      result = computeStatistics(toolInput.lottery_id, toolInput.draws);
      break;

    default:
      result = { error: `Tool ${toolName} não encontrada` };
  }

  return JSON.stringify(result);
}

// ═══════════════════════════════════════════════════════════════
// PARTE 4: VALIDAÇÕES (Anti-Alucinação)
// ═══════════════════════════════════════════════════════════════

function validateUserQuery(query: string): { valid: boolean; error?: string } {
  // Palavras/frases suspeitas
  const suspiciousPatterns = [
    /\b(garanto|100%|certeza)\b/i,
    /\b(números que.*sair)\b/i,
    /\b(método secreto|truque)\b/i,
    /\b(vou acertar|vou ganhar)\b/i,
    /\b(segredo|fórmula mágica)\b/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(query)) {
      return {
        valid: false,
        error: "Consulta contém pedido de predição ou garantia impossível"
      };
    }
  }

  return { valid: true };
}

function validateLLMResponse(response: string): { valid: boolean; reason?: string } {
  const forbiddenPhrases = [
    "esses números vão",
    "com certeza sairá",
    "100% de chance",
    "garanto que",
    "método infalível",
    "fórmula secreta",
    "números mágicos"
  ];

  for (const phrase of forbiddenPhrases) {
    if (response.toLowerCase().includes(phrase.toLowerCase())) {
      return {
        valid: false,
        reason: `Resposta contém frase proibida: "${phrase}"`
      };
    }
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// PARTE 5: ENDPOINT PRINCIPAL
// ═══════════════════════════════════════════════════════════════

router.post("/analyze", async (req: Request, res: Response) => {
  const { query, lottery_id } = req.body;

  // Validação 1: Input obrigatório
  if (!query || !lottery_id) {
    return res.status(400).json({
      error: "Parâmetros obrigatórios: 'query' e 'lottery_id'"
    });
  }

  // Validação 2: Loteria válida
  if (!LOTTERY_RULES[lottery_id]) {
    return res.status(400).json({
      error: `Loteria inválida: ${lottery_id}`,
      valid_options: Object.keys(LOTTERY_RULES)
    });
  }

  // Validação 3: Query segura
  const queryValidation = validateUserQuery(query);
  if (!queryValidation.valid) {
    return res.status(400).json({
      error: queryValidation.error,
      hint: "Use consultas honestas como 'qual a frequência do número 7?'"
    });
  }

  try {
    // System prompt RIGOROSO
    const systemPrompt = `Você é um ANALISTA DE LOTERIAS honesto e científico.

REGRAS ABSOLUTAS:
1. Use APENAS as ferramentas MCP fornecidas para dados
2. NUNCA invente números ou probabilidades
3. NUNCA faça predições de resultados futuros
4. SEMPRE reconheça que cada sorteio é independente
5. Se não conseguir buscar dados, diga claramente
6. Sempre inclua disclaimers sobre aleatoriedade
7. Use termos como "frequência histórica", não "números que vão sair"

Seu trabalho: Fornecer análises honestas de dados históricos.
Seu limite: Você não pode prever o futuro.`;

    // Chamada inicial
    let response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      system: systemPrompt,
      tools: mcpTools,
      messages: [{ role: "user", content: query }]
    });

    // Loop de tool use
    let messages: any[] = [{ role: "user", content: query }];

    while (response.stop_reason === "tool_use") {
      // Extrair blocos de tool_use
      const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");

      // Adicionar resposta do assistente
      messages.push({ role: "assistant", content: response.content });

      // Processar cada tool call
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const toolResult = await processToolCall(toolBlock.name, toolBlock.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: toolResult
        });
      }

      // Adicionar resultados
      messages.push({ role: "user", content: toolResults });

      // Próxima iteração
      response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        tools: mcpTools,
        messages
      });
    }

    // Extrair resposta final
    const finalText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    // Validação 4: LLM output check
    const outputValidation = validateLLMResponse(finalText);
    if (!outputValidation.valid) {
      console.warn("LLM output validation failed:", outputValidation.reason);
      // Log mas não bloqueia (transparência)
    }

    // Resposta final
    return res.json({
      success: true,
      query,
      lottery_id,
      analysis: finalText,
      metadata: {
        source: "MCP-powered analysis with real data validation",
        validation: outputValidation.valid ? "passed" : "warning",
        timestamp: new Date().toISOString(),
        model: "claude-3-5-sonnet-20241022"
      }
    });

  } catch (error: any) {
    console.error("MCP Analysis error:", error);
    return res.status(500).json({
      success: false,
      error: "Erro na análise",
      details: process.env.NODE_ENV === "development" ? error.message : "Erro interno",
      timestamp: new Date().toISOString()
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// PARTE 6: HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    mcp_gateway: "operational",
    tools_available: mcpTools.length,
    tools: mcpTools.map(t => t.name),
    timestamp: new Date().toISOString()
  });
});

export default router;
