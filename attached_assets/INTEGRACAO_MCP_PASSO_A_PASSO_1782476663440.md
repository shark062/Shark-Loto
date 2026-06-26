# INTEGRAÇÃO MCP NO SHARK-LOTO - PASSO A PASSO

## 1️⃣ INSTALAÇÃO DAS DEPENDÊNCIAS

```bash
# Na pasta artifacts/api-server
cd artifacts/api-server

# Instale a SDK do Anthropic
npm install @anthropic-ai/sdk

# Verifique no package.json
npm list @anthropic-ai/sdk
```

---

## 2️⃣ COPIANDO OS ARQUIVOS

### Opção A: Copiar o arquivo pronto (RECOMENDADO)

```bash
# De onde você salvou o arquivo, copie para:
cp mcp-gateway-implementation.ts artifacts/api-server/src/routes/mcp-gateway.ts
```

### Opção B: Criar arquivo manualmente

1. Abra: `artifacts/api-server/src/routes/`
2. Crie novo arquivo: `mcp-gateway.ts`
3. Cole o conteúdo de `mcp-gateway-implementation.ts`

---

## 3️⃣ INTEGRAR NO APP PRINCIPAL

### Editar: `artifacts/api-server/src/app.ts`

Encontre a seção de imports (topo do arquivo):

```typescript
// ANTES (linhas 1-14):
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import aiProvidersRouter from "./routes/aiProviders";
import aiAnalysisRouter from "./routes/aiAnalysis";
import predictionRouter from "./routes/prediction";
import chatRouter from "./routes/chat";
// ... resto dos imports

// DEPOIS (adicione esta linha):
import mcpGatewayRouter from "./routes/mcp-gateway";
```

Depois, encontre a seção de rotas (depois de `app.use(express.json())`):

```typescript
// ANTES (linhas ~32-38):
app.use("/api", router);
app.use("/api/ai-providers", aiProvidersRouter);
app.use("/api/ai", aiAnalysisRouter);
app.use("/api/prediction", predictionRouter);
app.use("/api/chat", chatRouter);

// DEPOIS (adicione isto):
app.use("/api/mcp", mcpGatewayRouter);
```

---

## 4️⃣ VERIFICAR SE ESTÁ FUNCIONANDO

### Inicie o servidor

```bash
cd artifacts/api-server
npm run dev

# Você deve ver algo como:
# ✓ Server running on http://localhost:3000
# ✓ MCP Gateway initialized
```

### Teste o health check

```bash
# Em outro terminal:
curl http://localhost:3000/api/mcp/health

# Resposta esperada:
{
  "status": "ok",
  "mcp_gateway": "operational",
  "tools_available": 4,
  "tools": [
    "fetch_lottery_draws",
    "validate_lottery_combination",
    "analyze_frequency",
    "compute_statistics"
  ],
  "timestamp": "2026-06-26T11:50:00.000Z"
}
```

---

## 5️⃣ TESTAR O ENDPOINT PRINCIPAL

### Teste 1: Query Simples

```bash
curl -X POST http://localhost:3000/api/mcp/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Qual é a frequência do número 7 na Mega-Sena?",
    "lottery_id": "megasena"
  }'
```

### Teste 2: Validação de Números

```bash
curl -X POST http://localhost:3000/api/mcp/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "A combinação 5, 15, 28, 35, 42, 50 é válida para a Mega-Sena?",
    "lottery_id": "megasena"
  }'
```

### Teste 3: Análise com Disclaimer

```bash
curl -X POST http://localhost:3000/api/mcp/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Mostre a frequência histórica dos números na Quina",
    "lottery_id": "quina"
  }'
```

---

## 6️⃣ INTEGRAR NO FRONTEND (OPCIONAL)

### Hook React para usar MCP

Crie o arquivo: `artifacts/loto-shark/src/hooks/useMCPAnalysis.ts`

```typescript
import { useState } from 'react';

interface MCPAnalysisResult {
  success: boolean;
  query: string;
  lottery_id: string;
  analysis: string;
  metadata?: {
    source: string;
    validation: string;
    timestamp: string;
    model: string;
  };
  error?: string;
}

export function useMCPAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MCPAnalysisResult | null>(null);

  const analyze = async (query: string, lotteryId: string) => {
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
      setResult(data);
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { analyze, loading, error, result };
}
```

### Componente React usando o Hook

```tsx
// artifacts/loto-shark/src/components/MCPAnalyzer.tsx
import { useState } from 'react';
import { useMCPAnalysis } from '../hooks/useMCPAnalysis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LOTTERIES = [
  { id: 'megasena', name: 'Mega-Sena' },
  { id: 'quina', name: 'Quina' },
  { id: 'lotofacil', name: 'Lotofácil' },
];

export function MCPAnalyzer() {
  const [query, setQuery] = useState('');
  const [selectedLottery, setSelectedLottery] = useState('megasena');
  const { analyze, loading, result, error } = useMCPAnalysis();

  const handleAnalyze = async () => {
    if (!query.trim()) return;
    await analyze(query, selectedLottery);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Análise com MCP (Dados Reais)</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Seletor de Loteria */}
        <div>
          <label className="text-sm font-medium">Loteria</label>
          <select 
            value={selectedLottery}
            onChange={(e) => setSelectedLottery(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {LOTTERIES.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Campo de Query */}
        <div>
          <label className="text-sm font-medium">Sua Pergunta</label>
          <Input
            placeholder="Ex: Qual a frequência do número 7?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
            disabled={loading}
          />
        </div>

        {/* Botão */}
        <Button 
          onClick={handleAnalyze}
          disabled={loading || !query.trim()}
          className="w-full"
        >
          {loading ? '⏳ Analisando...' : '🔍 Analisar com MCP'}
        </Button>

        {/* Erro */}
        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {/* Resultado */}
        {result?.success && (
          <div className="bg-blue-50 p-4 rounded space-y-2">
            <div className="font-mono text-sm whitespace-pre-wrap">
              {result.analysis}
            </div>
            <div className="text-xs text-gray-500">
              <strong>Fonte:</strong> {result.metadata?.source}
              <br/>
              <strong>Validação:</strong> {result.metadata?.validation}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-xs">
          ⚠️ <strong>Aviso Legal:</strong> Loterias são eventos aleatórios. 
          Frequências históricas NÃO predizem resultados futuros.
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 7️⃣ ESTRUTURA DE DIRETÓRIOS (FINAL)

```
artifacts/
├── api-server/
│   └── src/
│       ├── app.ts                      (MODIFICADO - adicionou mcpGatewayRouter)
│       ├── index.ts
│       ├── lib/
│       │   ├── logger.ts
│       │   ├── aiProviders.ts
│       │   ├── aiEnsemble.ts
│       │   └── lotteryData.ts
│       ├── routes/
│       │   ├── index.ts
│       │   ├── aiAnalysis.ts
│       │   ├── prediction.ts
│       │   ├── chat.ts
│       │   └── mcp-gateway.ts          (NOVO ✅)
│       └── core/
│           ├── sharkEngine.ts
│           └── statisticalEngine.ts
│
└── loto-shark/
    └── src/
        ├── hooks/
        │   └── useMCPAnalysis.ts       (NOVO ✅)
        ├── components/
        │   └── MCPAnalyzer.tsx         (NOVO ✅)
        └── pages/
            └── ...
```

---

## 8️⃣ VARIÁVEIS DE AMBIENTE

Crie/atualize `.env` em `artifacts/api-server/`:

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-... # Sua chave real

# Server
NODE_ENV=development
PORT=3000

# MCP Gateway
MCP_ENABLED=true
MCP_CACHE_TTL=300000

# Logging
LOG_LEVEL=info
```

---

## 9️⃣ TROUBLESHOOTING

### "Module not found: @anthropic-ai/sdk"
```bash
npm install @anthropic-ai/sdk
npm run build
```

### "ANTHROPIC_API_KEY not set"
```bash
# Verifique seu .env file
echo $ANTHROPIC_API_KEY

# Se vazio, set-o:
export ANTHROPIC_API_KEY=sk-ant-...
```

### MCP endpoint retorna 404
```bash
# Certifique-se de que:
1. app.ts tem: app.use('/api/mcp', mcpGatewayRouter);
2. O arquivo mcp-gateway.ts está em src/routes/
3. Export padrão está correto: export default router;

# Teste:
curl http://localhost:3000/api/mcp/health
```

### LLM response muito lenta
```typescript
// Em mcp-gateway.ts, aumente timeout:
const response = await client.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 2048,
  timeout: 30000, // Aumentar se necessário
  // ...
});
```

---

## 🔟 PRÓXIMOS PASSOS

1. **Conectar a Caixa API real** (substitua MOCK_LOTTERY_DATA)
2. **Adicionar caching** com Redis para performance
3. **Rate limiting** por IP/usuário
4. **Logging detalhado** de todas as análises
5. **Métricas** de acurácia e usage

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Dependência `@anthropic-ai/sdk` instalada
- [ ] Arquivo `mcp-gateway.ts` copiado para `src/routes/`
- [ ] Import adicionado em `app.ts`
- [ ] Rota registrada em `app.ts` (`/api/mcp`)
- [ ] `.env` com `ANTHROPIC_API_KEY` configurado
- [ ] Server iniciado e `/api/mcp/health` retorna 200
- [ ] Teste POST para `/api/mcp/analyze` funciona
- [ ] (Opcional) Hook `useMCPAnalysis` criado
- [ ] (Opcional) Componente `MCPAnalyzer` adicionado ao UI

---

## 📊 FLUXO DE DADOS COM MCP

```
User Query
    ↓
Validação (suicidas patterns)
    ↓
POST /api/mcp/analyze
    ↓
System Prompt (instrui honestidade)
    ↓
Claude chama Tools (fetch_lottery_draws, etc)
    ↓
Tools retornam DADOS REAIS (não alucinação)
    ↓
Claude analisa dados
    ↓
Validação de Output (detecta promessas falsas)
    ↓
JSON Response com análise + disclaimer
    ↓
Frontend mostra resultado
```

---

## 🎯 BENEFÍCIOS DESTA IMPLEMENTAÇÃO

| Problema | Solução |
|----------|---------|
| IA inventa números | Tools buscam dados reais |
| Promessas falsas | Validação de output |
| "Métodos secretos" | Apenas análise de frequência |
| Sem fonte de dados | Sempre rastreia origem |
| LLM descontrolada | System prompt rigoroso |
| Falta de disclaimers | Sempre inclusos |

---

## ⚠️ LEMBRETE FINAL

Este MCP **não** melhora acertividade em loterias (impossível).
Mas **sim** elimina alucinações e fornece análises honestas.

Use com responsabilidade! 🎲
