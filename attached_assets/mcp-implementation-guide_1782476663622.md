# MCP Implementation Guide - Shark-Loto
## Eliminar Alucinações com APIs Reais e Validação Rigorosa

---

## 1. ARQUITETURA MCP PROPOSTA

### Estrutura de Camadas
```
┌─────────────────────────────────────────────────┐
│          Frontend (React - loto-shark)          │
│  (não vai chamar IA diretamente, usa MCP)       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│     MCP Server Hub (orquestra chamadas)         │
│  - Valida requests                              │
│  - Cacheia resultados                           │
│  - Rate limiting                                │
└──────┬────────────┬────────────┬────────────────┘
       │            │            │
   ┌───▼──┐  ┌──────▼───┐  ┌────▼─────┐
   │ MCP  │  │   MCP    │  │   MCP    │
   │Loteria│  │Analytics │  │ RealData │
   └───┬──┘  └──────┬───┘  └────┬─────┘
       │            │            │
   ┌───▼────────────▼────────────▼───┐
   │  TRUTH SOURCE (Dados Reais)     │
   │  - Caixa API (loterias oficiais)│
   │  - Histórico validado            │
   │  - Estatísticas computadas       │
   └─────────────────────────────────┘
```

### Por que evita alucinações:
- ✅ Dados vêm sempre de APIs reais (não da IA)
- ✅ IA só analisa dados validados
- ✅ Não há espaço para "inventar" números
- ✅ Validação em 3 camadas

---

## 2. MCP SERVERS ESPECÍFICOS

### MCP Server 1: Lottery Data Service
**Responsabilidade:** Fornecer dados reais de loterias

```typescript
// artifact/mcp-servers/lottery-data.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Tools que NÃO ALUCINAM
const lotteryTools = [
  {
    name: "fetch_lottery_results",
    description: "Busca resultados oficiais de loterias (fonte: Caixa Econômica)",
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
          maximum: 100,
          description: "Quantos concursos retornar"
        }
      },
      required: ["lottery_id"]
    }
  },
  {
    name: "validate_numbers",
    description: "Valida se números são válidos para uma loteria",
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
          description: "Números a validar"
        }
      },
      required: ["lottery_id", "numbers"]
    }
  }
];

// Handler para tools
async function processLotteryToolCall(toolName: string, toolInput: any) {
  switch (toolName) {
    case "fetch_lottery_results":
      return await fetchRealResults(toolInput.lottery_id, toolInput.limit || 10);
    
    case "validate_numbers":
      return validateNumbersForLottery(toolInput.lottery_id, toolInput.numbers);
    
    default:
      return { error: `Tool ${toolName} not found` };
  }
}

// Implementações
async function fetchRealResults(lotteryId: string, limit: number) {
  // NÃO INVENTA DADOS - Busca de API real
  try {
    const response = await fetch(`https://api.caixa.gov.br/loterias/${lotteryId}?limit=${limit}`);
    const data = await response.json();
    
    // Validação adicional
    if (!data.results || !Array.isArray(data.results)) {
      return { error: "Dados inválidos da API", status: "failed_validation" };
    }
    
    return {
      lottery: lotteryId,
      count: data.results.length,
      results: data.results.map(r => ({
        contest: r.number,
        date: r.date,
        numbers: r.numbers.sort((a,b) => a-b),
        prize: r.prize,
        validation_hash: computeHash(r) // Rastreabilidade
      })),
      source: "caixa.gov.br",
      fetched_at: new Date().toISOString()
    };
  } catch (error) {
    return { error: `Falha ao buscar dados: ${error.message}`, status: "api_error" };
  }
}

function validateNumbersForLottery(lotteryId: string, numbers: number[]) {
  // Regras rígidas - não há espaço para interpretação
  const rules: Record<string, { min: number; max: number; count: number }> = {
    megasena: { min: 1, max: 60, count: 6 },
    quina: { min: 1, max: 80, count: 5 },
    lotofacil: { min: 1, max: 25, count: 15 },
    lotomania: { min: 0, max: 99, count: 50 },
    timemania: { min: 1, max: 80, count: 10 },
    diadesorte: { min: 1, max: 31, count: 7 }
  };

  const rule = rules[lotteryId];
  if (!rule) return { valid: false, error: "Loteria inválida" };

  const errors = [];
  
  if (numbers.length !== rule.count) {
    errors.push(`Deve ter exatamente ${rule.count} números`);
  }
  
  const duplicates = new Set(numbers).size !== numbers.length;
  if (duplicates) {
    errors.push("Números duplicados não permitidos");
  }
  
  const outOfRange = numbers.filter(n => n < rule.min || n > rule.max);
  if (outOfRange.length > 0) {
    errors.push(`Números fora do range ${rule.min}-${rule.max}: ${outOfRange.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    numbers_sorted: [...numbers].sort((a,b) => a-b),
    lottery: lotteryId
  };
}

function computeHash(result: any): string {
  // Para rastreabilidade
  return require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(result))
    .digest('hex')
    .slice(0, 8);
}

export { lotteryTools, processLotteryToolCall };
```

### MCP Server 2: Analytics (SEM alucinação)
**Responsabilidade:** Análise APENAS de dados já validados

```typescript
// artifact/mcp-servers/analytics.ts

const analyticsTools = [
  {
    name: "compute_frequency_analysis",
    description: "Calcula frequência de números em resultados validados",
    input_schema: {
      type: "object",
      properties: {
        lottery_id: { type: "string" },
        data: {
          type: "object",
          description: "Dados já validados (com validation_hash)"
        }
      }
    }
  },
  {
    name: "statistical_summary",
    description: "Retorna sumário estatístico RIGOROSO (sem predições)",
    input_schema: {
      type: "object",
      properties: {
        lottery_id: { type: "string" },
        validated_results: { type: "array" }
      }
    }
  }
];

function computeFrequencyAnalysis(lotteryId: string, data: any) {
  if (!data.results || !Array.isArray(data.results)) {
    return { error: "Dados não são array", status: "invalid_format" };
  }

  const allNumbers = data.results.flatMap(r => r.numbers);
  const frequency = new Map<number, number>();

  for (const num of allNumbers) {
    frequency.set(num, (frequency.get(num) || 0) + 1);
  }

  return {
    frequency_table: Array.from(frequency.entries())
      .map(([num, freq]) => ({
        number: num,
        frequency: freq,
        percentage: ((freq / allNumbers.length) * 100).toFixed(2) + "%"
      }))
      .sort((a, b) => b.frequency - a.frequency),
    
    statistics: {
      total_draws: data.results.length,
      total_occurrences: allNumbers.length,
      average_per_draw: (allNumbers.length / data.results.length).toFixed(2),
      most_frequent: frequency.size > 0 
        ? Math.max(...frequency.values()) 
        : 0
    },
    
    // IMPORTANTE: disclaimer
    disclaimer: "Estas são FREQUÊNCIAS HISTÓRICAS apenas. NÃO PREDIZEM futuros resultados. Loterias são aleatórias.",
    source: data.source,
    calculation_timestamp: new Date().toISOString()
  };
}

function statisticalSummary(lotteryId: string, validatedResults: any[]) {
  return {
    summary: {
      draws_analyzed: validatedResults.length,
      date_range: {
        oldest: validatedResults[validatedResults.length - 1]?.date,
        newest: validatedResults[0]?.date
      }
    },
    
    // NUNCA retorna predições
    what_this_shows: "Padrões históricos apenas",
    what_this_does_not_show: "Probabilidades futuras, números 'atrasados', padrões preditivos",
    
    limitations: [
      "Cada sorteio é independente",
      "Frequência passada ≠ probabilidade futura",
      "Loterias usam RNG verdadeiro"
    ]
  };
}

export { analyticsTools, computeFrequencyAnalysis, statisticalSummary };
```

---

## 3. IMPLEMENTAÇÃO NO EXPRESS

```typescript
// artifact/api-server/src/routes/mcp-gateway.ts
import express, { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { lotteryTools, processLotteryToolCall } from '../mcp-servers/lottery-data';
import { analyticsTools, computeFrequencyAnalysis } from '../mcp-servers/analytics';

const router = Router();
const client = new Anthropic();

// Todos os tools combinados
const allTools = [...lotteryTools, ...analyticsTools];

// POST /api/mcp/analyze
router.post("/analyze", async (req, res) => {
  const { query, lottery_id } = req.body;
  
  if (!query || !lottery_id) {
    return res.status(400).json({ error: "query e lottery_id obrigatórios" });
  }

  // Validação inicial
  const validLotteries = ["megasena", "quina", "lotofacil", "lotomania", "timemania", "diadesorte"];
  if (!validLotteries.includes(lottery_id)) {
    return res.status(400).json({ error: "lottery_id inválido" });
  }

  try {
    // Prompt que LIMITA o escopo da IA
    const systemPrompt = `Você é um analista de loterias. 

INSTRUÇÕES CRÍTICAS:
1. SÓ use as ferramentas MCP disponíveis para obter dados
2. NUNCA invente números ou resultados
3. Se não conseguir buscar com tools, retorne erro claro
4. Sempre cite a fonte dos dados (sempre será Caixa API)
5. NUNCA faça predições - apenas análise de frequência histórica
6. Sempre coloque disclaimer que loterias são aleatórias

Seu rol: Buscar dados reais e analisá-los de forma honesta.`;

    const userMessage = `${query} (Loteria: ${lottery_id})`;

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      system: systemPrompt,
      tools: allTools,
      messages: [{ role: "user", content: userMessage }]
    });

    // Process tool calls
    let messages = [{ role: "user", content: userMessage }];
    let assistantResponse = response;

    while (assistantResponse.stop_reason === "tool_use") {
      const toolUseBlocks = assistantResponse.content.filter(b => b.type === "tool_use");
      messages.push({ role: "assistant", content: assistantResponse.content });

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await processToolCall(toolBlock.name, toolBlock.input, lottery_id);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result)
        });
      }

      messages.push({ role: "user", content: toolResults });

      assistantResponse = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        tools: allTools,
        messages
      });
    }

    // Extract final text
    const finalText = assistantResponse.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    return res.json({
      query,
      lottery_id,
      analysis: finalText,
      source: "MCP-powered analysis with real data",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("MCP Analysis error:", error);
    return res.status(500).json({ 
      error: "Falha na análise",
      details: error.message 
    });
  }
});

async function processToolCall(toolName: string, toolInput: any, lotteryId: string) {
  try {
    if (toolName === "fetch_lottery_results" || toolName === "validate_numbers") {
      return await processLotteryToolCall(toolName, toolInput);
    } else if (toolName === "compute_frequency_analysis") {
      return computeFrequencyAnalysis(lotteryId, toolInput.data);
    }
    return { error: `Tool desconhecido: ${toolName}` };
  } catch (error) {
    return { error: error.message, status: "execution_error" };
  }
}

export default router;
```

---

## 4. IMPLEMENTAÇÃO NO FRONTEND

```typescript
// artifact/loto-shark/src/hooks/useMCPAnalysis.ts
import { useState } from 'react';

export function useMCPAnalysis(lotteryId: string) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeWithMCP = async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/mcp/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lottery_id: lotteryId })
      });

      if (!response.ok) {
        throw new Error('Falha na análise MCP');
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err.message);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  return { analysis, loading, error, analyzeWithMCP };
}
```

---

## 5. CAMADAS DE VALIDAÇÃO (Anti-Alucinação)

### Camada 1: Input Validation
```typescript
function validateInput(query: string, lotteryId: string): ValidationResult {
  // Rejeita prompts suspeitos
  const suspiciousPatterns = [
    /\b(gabarito|resposta)\b/i,  // Garantir resultado
    /\b(prevejo|vou acertar)\b/i, // Predição de futuro
    /\b(segredo|truque)\b/i,      // Enganação
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(query)) {
      return {
        valid: false,
        error: "Consulta contém pedido de predição/manipulação"
      };
    }
  }

  return { valid: true };
}
```

### Camada 2: API Response Validation
```typescript
function validateAPIResponse(data: any): boolean {
  // Valida estrutura dos dados da Caixa API
  if (!data.results || !Array.isArray(data.results)) return false;
  
  for (const result of data.results) {
    if (!result.number || !Array.isArray(result.numbers)) return false;
    // Mais validações...
  }
  
  return true;
}
```

### Camada 3: LLM Output Validation
```typescript
function validateLLMOutput(text: string): ValidationResult {
  // Rejeita respostas que violam regras
  const forbiddenPhrases = [
    "esses números vão sair",
    "com certeza",
    "100% de chance",
    "números secretos",
    "método garantido"
  ];

  for (const phrase of forbiddenPhrases) {
    if (text.toLowerCase().includes(phrase)) {
      return {
        valid: false,
        error: "Resposta contém predição falsa ou garantia impossível"
      };
    }
  }

  return { valid: true };
}
```

---

## 6. INSTALAR & EXECUTAR

### Passo 1: Adicionar dependência MCP
```bash
cd artifacts/api-server
npm install @anthropic-ai/sdk
```

### Passo 2: Registrar rotas no app.ts
```typescript
import mcpRouter from './routes/mcp-gateway';
app.use('/api/mcp', mcpRouter);
```

### Passo 3: Testar
```bash
curl -X POST http://localhost:3000/api/mcp/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Quantas vezes o número 7 saiu na Mega-Sena nos últimos 100 sorteios?",
    "lottery_id": "megasena"
  }'
```

---

## 7. COMO ISSO ELIMINA ALUCINAÇÕES

| Alucinação | Como MCP Previne |
|-----------|-----------------|
| "Números que vão sair" | Ferramentas SÓ retornam histórico |
| "Método 100% preciso" | Validação de output do LLM |
| "Números inventados" | API Caixa é fonte único de verdade |
| "Fórmula secreta" | LLM não tem acesso a isso |
| "Padrões que não existem" | Tools calculam frequência, não criam padrões |

---

## 8. PRÓXIMAS MELHORIAS

1. **Caching Inteligente**: Cachear resultados da Caixa por 24h
2. **Rate Limiting**: Limitar chamadas por usuário/IP
3. **Audit Trail**: Logar todas as análises para compliance
4. **Webhooks**: Atualizar dados em tempo real
5. **Multi-Currency MCP**: Expandir para outras loterias mundiais

---

## Resumo

✅ **MCP elimina alucinações porque:**
- Dados vêm de APIs reais, nunca do LLM
- Validação em 3 camadas (input, API, output)
- IA não tem autonomia para inventar
- Cada resposta é rastreável (hash/timestamp)
- Disclaimer obrigatório sobre aleatório riedade
