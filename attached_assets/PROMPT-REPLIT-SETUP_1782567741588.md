# 🦈 Prompt Completo — Configurar Loto-Shark no Replit

Cole este prompt exatamente como está no chat do agente Replit.

---

## PROMPT

Você está configurando o projeto **Loto-Shark** do zero no Replit. Siga cada etapa na ordem exata. Responda em português.

---

### 📁 ESTRUTURA DO PROJETO

Monorepo com pnpm workspaces:
```
/
├── artifacts/
│   ├── loto-shark/       → Frontend React + Vite (porta 5000)
│   └── api-server/       → Backend Express 5 + TypeScript (porta 8080)
├── lib/
│   └── db/               → Neon PostgreSQL + Drizzle ORM
├── .replit               → Workflows de execução
└── pnpm-workspace.yaml
```

---

### 🔐 PASSO 1 — Configurar Secrets no Replit

Vá em **Tools → Secrets** e crie as seguintes variáveis (coloque as chaves reais):

| Secret | Valor |
|--------|-------|
| `GROQ_API_KEY` | sua chave do console.groq.com |
| `ANTHROPIC_API_KEY` | sua chave do console.anthropic.com |
| `GOOGLE_API_KEY` | sua chave do aistudio.google.com |
| `OPENROUTER_API_KEY` | sua chave do openrouter.ai |
| `OPENAI_API_KEY` | sua chave (opcional, pode estar sem créditos) |
| `DEEPSEEK_API_KEY` | sua chave (opcional, pode estar sem créditos) |
| `DATABASE_URL` | string de conexão Neon PostgreSQL |

> ⚠️ **NUNCA crie arquivo `.env` no Replit.** Use apenas a aba Secrets.

---

### 📦 PASSO 2 — Instalar dependências

```bash
pnpm install
```

Se der erro de lockfile:
```bash
pnpm install --no-frozen-lockfile
```

---

### 🗄️ PASSO 3 — Aplicar schema do banco

```bash
pnpm --filter @workspace/db run push
```

Se der erro de migration, tente:
```bash
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run push
```

---

### ▶️ PASSO 4 — Verificar workflows no `.replit`

O arquivo `.replit` já está configurado com dois workflows paralelos:
- **Start application** → `PORT=5000 pnpm --filter @workspace/loto-shark run dev`
- **API Server** → `PORT=8080 pnpm --filter @workspace/api-server run dev`

Clique no botão **Run** para iniciar ambos.

---

### 🔑 PASSO 5 — CORREÇÃO CRÍTICA: Chaves de API não atualizam

**O problema:** A função `initDefaultProviders()` em `artifacts/api-server/src/lib/aiProviders.ts` só lê as variáveis de ambiente (`process.env`) na **primeira vez** que o banco está vazio. Depois disso, sempre carrega do banco — e se uma chave foi salva errada ou expirou, ela trava lá para sempre.

**A correção:** Substitua a função `initDefaultProviders` em `artifacts/api-server/src/lib/aiProviders.ts` por esta versão:

```typescript
// ─── Initialize providers: load from DB, sync keys from env ──────────────────
export async function initDefaultProviders(): Promise<void> {
  await loadProvidersFromDB();

  // Mapeamento: tipo do provider → variável de ambiente
  const envProviders: Array<{ type: string; name: string; envKey: string; model?: string }> = [
    { type: "openai",     name: "OpenAI",     envKey: "OPENAI_API_KEY" },
    { type: "anthropic",  name: "Anthropic",  envKey: "ANTHROPIC_API_KEY" },
    { type: "gemini",     name: "Gemini",     envKey: "GOOGLE_API_KEY" },
    { type: "groq",       name: "Groq",       envKey: "GROQ_API_KEY" },
    { type: "deepseek",   name: "DeepSeek",   envKey: "DEEPSEEK_API_KEY" },
    { type: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
    { type: "mistral",    name: "Mistral",    envKey: "MISTRAL_API_KEY" },
    { type: "cohere",     name: "Cohere",     envKey: "COHERE_API_KEY" },
  ];

  let synced = 0;
  let added = 0;

  for (const ep of envProviders) {
    const envKey = process.env[ep.envKey];
    if (!envKey) continue;

    // Procura se já existe um provider deste tipo no banco
    const existing = [...providers.values()].find((p) => p.type === ep.type);

    if (existing) {
      // Se a chave no banco for diferente da variável de ambiente, atualiza
      if (existing.apiKey !== envKey) {
        logger.info(
          { type: ep.type, name: ep.name },
          "Chave de API atualizada via variável de ambiente"
        );
        await updateProvider(existing.id, { apiKey: envKey, enabled: true });
        synced++;
      }
    } else {
      // Provider ainda não existe no banco — cria
      await addProvider({ type: ep.type, name: ep.name, apiKey: envKey, model: ep.model });
      added++;
    }
  }

  if (added > 0)   logger.info({ added },   "Novos providers adicionados das variáveis de ambiente");
  if (synced > 0)  logger.info({ synced },  "Chaves de API sincronizadas das variáveis de ambiente");
  if (added === 0 && synced === 0 && providers.size === 0) {
    logger.warn("Nenhuma chave de API encontrada. Configure providers via /api/ai-providers ou Secrets do Replit.");
  }
}
```

**Por que isso corrige:** Agora a cada restart do servidor, o código **compara** a chave que está no banco com a que está no Secret. Se for diferente, atualiza. Antes ele só lia as variáveis de ambiente quando o banco estava vazio — por isso trocar o Secret não tinha efeito.

---

### ✅ PASSO 6 — Validar funcionamento

Após iniciar, rode os seguintes testes:

**1. Health check da API:**
```bash
curl http://localhost:8080/api/health
```
Esperado: `{ "status": "ok" }`

**2. Listar providers carregados:**
```bash
curl http://localhost:8080/api/ai-providers
```
Esperado: JSON com os providers e `apiKey` mascarado (ex: `"gsk_****7x"`)

**3. Testar um provider específico (ex: Groq):**
```bash
curl -X POST http://localhost:8080/api/ai-providers/{ID_DO_GROQ}/test
```
Esperado: `{ "success": true, "latencyMs": ... }`

**4. Verificar frontend:**
Abra a aba **Webview** do Replit — o app deve carregar com o design cyberpunk.

---

### 🐛 PROBLEMAS COMUNS

**"Provider carregados do banco — sem necessidade de seed"** mas a chave está errada:
→ Isso era o bug antigo. Com a correção do Passo 5, não acontece mais. Se ainda acontecer, delete os providers pelo endpoint e reinicie:
```bash
curl -X DELETE http://localhost:8080/api/ai-providers/{ID}
```

**API da Caixa retorna 404 no Render (não no Replit):**
→ O Render usa IPs americanos e a Caixa bloqueia por geo-IP. No Replit funciona normalmente. Em produção no Render, o frontend chama a Caixa diretamente do browser do usuário — isso funciona. Não tente chamar a Caixa pelo backend no Render.

**Service Worker não atualiza o app nativo (PWA Builder):**
→ A cada deploy, incremente `CACHE_VERSION` em `artifacts/loto-shark/public/sw.js`:
```js
const CACHE_VERSION = 'v3'; // era v2, vira v3, etc.
```

**Erro `Cannot find module '@workspace/db'`:**
```bash
pnpm install
pnpm --filter @workspace/db run push
```

**Porto 8080 já em uso:**
→ No Replit isso é normal se o workflow já estiver rodando. Pare o workflow e reinicie.

---

### 📋 CHECKLIST FINAL

- [ ] Secrets configurados (pelo menos GROQ_API_KEY)
- [ ] `pnpm install` executado sem erros
- [ ] Schema do banco aplicado (`db push`)
- [ ] Função `initDefaultProviders` corrigida
- [ ] Workflow "Project" rodando (frontend na porta 5000, API na 8080)
- [ ] `GET /api/health` retorna `{ "status": "ok" }`
- [ ] `GET /api/ai-providers` lista os providers com chaves mascaradas
- [ ] Frontend abre no Webview sem erros no console
