# Loto-Shark

Plataforma brasileira de análise de loterias com design cyberpunk, previsões por ensemble de IA, dados reais da API da Caixa Econômica Federal e persistência em PostgreSQL.

## Run & Operate

- `PORT=8080 pnpm --filter @workspace/api-server run dev` — API server (porta 8080)
- `PORT=23571 BASE_PATH=/ pnpm --filter @workspace/loto-shark run dev` — Frontend Vite (porta 23571)
- `pnpm run typecheck` — typecheck completo em todos os pacotes
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/db run push` — aplica schema no banco (apenas dev)
- Required env: `DATABASE_URL` — PostgreSQL connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite 7 + TailwindCSS 4 + Framer Motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validação: Zod (`zod/v4`), `drizzle-zod`
- IA: OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter, Mistral, Cohere
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/loto-shark/` — Frontend React (20 páginas, componentes, hooks)
- `artifacts/loto-shark/src/index.css` — Tema cyberpunk completo (neon vars, glass-card, etc.)
- `artifacts/loto-shark/public/` — Assets estáticos: 100 SVGs dezenas, bg-futurista.png, logos
- `artifacts/api-server/src/` — Backend Express (app.ts, 9 rotas, 3 engines de IA, 5 libs)
- `artifacts/api-server/src/engines/` — EnsembleEngine, AdaptiveEngine, FibonacciEngine
- `lib/db/src/schema/index.ts` — Schema Drizzle (user_games, ai_providers, app_settings)

## Architecture decisions

- **Proxy path-based**: Frontend em `/` (porta 23571), API em `/api` (porta 8080) — roteado pelo proxy Replit
- **runMigrations()**: Cria tabelas via `CREATE TABLE IF NOT EXISTS` no startup (sem drizzle-kit em prod)
- **8 AI providers**: Registrados automaticamente no banco no startup do API server
- **Env vars no workflow**: PORT e BASE_PATH injetados no comando do workflow (não via artifact.toml em dev)
- **glass-card via CSS variable**: `--glass-backdrop: blur(20px)` evita que Lightning CSS descarte `backdrop-filter`

## Product

- Dashboard com todas as 8 modalidades da Caixa (Mega-Sena, Lotofácil, Quina, etc.)
- Gerador de jogos com análise estatística e IA ensemble
- Mapa de calor de frequência de dezenas
- Histórico de resultados e análise de padrões
- Previsões por múltiplos modelos de IA com votação por ensemble
- Carrinho de jogos com exportação PDF

## User preferences

- Responder sempre em português (pt-BR)

## Gotchas

- O workflow deve incluir `PORT=23571 BASE_PATH=/` para o frontend e `PORT=8080` para a API
- `pnpm run dev` na raiz do workspace não funciona — use `--filter` com o pacote específico
- O Service Worker (sw.js) não funciona atrás do proxy Replit em dev — é esperado e não afeta o app

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
