---
name: Workflow setup
description: Configuração correta dos workflows para API e frontend do Loto-Shark no Replit.
---

## Regra

- **API Server**: `PORT=8080 bash scripts/start-api.sh` → waitForPort: 8080, outputType: console
- **Start application**: `PORT=5000 pnpm --filter @workspace/loto-shark run dev` → waitForPort: 5000, outputType: webview
- O Vite tem proxy `/api` → `http://localhost:8080` — não mudar a porta sem atualizar o vite.config.ts.

**Why:** O `index.ts` da API lança exceção se `PORT` não estiver definido. O workflow sem `PORT=8080` nunca abre a porta e o Replit mata o processo por timeout.

**How to apply:** Sempre que reconfigurar workflows, incluir `PORT=8080` no comando da API e `PORT=5000` no comando do frontend. O `scripts/start-api.sh` faz build TypeScript antes de iniciar — usar ele garante que mudanças no código sejam aplicadas no restart.
