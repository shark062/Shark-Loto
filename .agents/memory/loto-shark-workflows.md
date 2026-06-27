---
name: Loto-Shark workflows e portas
description: Como os workflows estão configurados e qual porta serve o preview do Replit
---

## Regra
- **Preview do Replit** usa porta 5000 → workflow "Start application" (`PORT=5000 pnpm --filter @workspace/loto-shark run dev`)
- **Artifact "loto-shark: web"** usa porta 23571 (atribuída pelo Replit, não configurável)
- **API** usa porta 8080 → workflow "artifacts/api-server: API Server" (`PORT=8080 pnpm run dev`)

**Why:** O sistema de artifacts do Replit atribui porta própria (23571), mas o `.replit` mapeia apenas 5000→80 (webview) e 8080. O workflow "Start application" na porta 5000 é necessário para que o preview do usuário funcione.

**How to apply:** Sempre manter o workflow "Start application" na porta 5000. Não deletá-lo. Os artifact workflows podem coexistir sem conflito.

## Configuração do Vite
- `vite.config.ts`: porta padrão 5000, HMR com `protocol: "wss", clientPort: 443` para ambiente Replit
- Proxy `/api` → `http://localhost:8080` (server-side, funciona corretamente)
