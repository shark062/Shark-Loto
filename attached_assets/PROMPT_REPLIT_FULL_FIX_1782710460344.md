# PROMPT COMPLETO — SHARK LOTERIAS: CORREÇÕES DE API, LAYOUT E RESPONSIVIDADE

> Aplique TODAS as correções abaixo exatamente como especificado.
> Não altere nenhum arquivo além dos listados. Não instale pacotes novos.
> Após aplicar, reinicie frontend e backend.

---

## PROBLEMA 1 — API NÃO CARREGA DADOS NO RENDER

**Causa raiz:** O `caixaApi.ts` do frontend ainda usa `fetch` direto sem passar pela variável `VITE_API_BASE_URL` para a função `apiFetch` interna. A função `apiFetch` local do arquivo não usa `resolveApiUrl`, então quando o frontend está no Render apontando para o backend externo, as chamadas `/api/lotteries/*` vão para o endereço errado (próprio frontend estático, que não tem API).

**Arquivo:** `artifacts/loto-shark/src/lib/caixaApi.ts`

Substitua a função `apiFetch` interna do arquivo por esta versão que usa `resolveApiUrl` e `credentialsMode` do `queryClient`:

```typescript
// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!n || n <= 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

// CORREÇÃO: usa resolveApiUrl para honrar VITE_API_BASE_URL no Render
import { resolveApiUrl } from "@/lib/queryClient";

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
    const credentials: RequestCredentials = API_BASE ? "omit" : "include";
    const res = await fetch(resolveApiUrl(path), { credentials });
    if (res.ok) return (await res.json()) as T;
  } catch {
    // falha de rede — retorna null para fallback
  }
  return null;
}
```

**ATENÇÃO:** Mantenha TODO o resto do arquivo `caixaApi.ts` exatamente igual. Apenas substitua o bloco `// ─── helpers ───` (as funções `formatBRL` e `apiFetch`).

---

## PROBLEMA 2 — RENDER.YAML: VITE_API_BASE_URL NÃO CONFIGURADO

**Causa raiz:** O `render.yaml` não passa a variável de ambiente `VITE_API_BASE_URL` para o frontend, então o frontend não sabe o endereço do backend no Render.

**Arquivo:** `render.yaml`

Substitua o arquivo COMPLETO por:

```yaml
services:
  # Frontend estático
  - type: web
    name: loto-shark-frontend
    runtime: static
    buildCommand: cd artifacts/loto-shark && npm install --legacy-peer-deps && npm run build
    staticPublishPath: artifacts/loto-shark/dist/public
    pullRequestPreviewsEnabled: false
    envVars:
      - key: VITE_API_BASE_URL
        sync: false
    routes:
      - type: rewrite
        source: /*
        destination: /index.html

  # API backend
  - type: web
    name: loto-shark-api
    runtime: node
    buildCommand: cd artifacts/api-server && npm install --legacy-peer-deps && npm run build
    startCommand: node artifacts/api-server/dist/index.mjs
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 8080
```

**IMPORTANTE:** Após fazer o deploy no Render, vá em "Environment" do serviço `loto-shark-frontend` e defina manualmente:
```
VITE_API_BASE_URL = https://loto-shark-api-XXXX.onrender.com
```
(substitua pelo URL real do seu serviço de API no Render)

---

## PROBLEMA 3 — CORS: ADICIONAR DOMÍNIO DO FRONTEND NO BACKEND

**Causa raiz:** O backend no Render precisa aceitar requisições do domínio do frontend estático do Render.

**Arquivo:** `artifacts/api-server/src/app.ts`

Localize o array `allowedOrigins` e substitua por:

```typescript
const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/,
  /\.onrender\.com$/,
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.repl\.co$/,
  /\.netlify\.app$/,
  /\.vercel\.app$/,
];
```

---

## PROBLEMA 4 — LAYOUT: CARDS E BOTÕES DESPADRONIZADOS

**Objetivo:** Padronizar o visual dos cards de loteria para seguir o padrão de app nativo Android/iOS:
- Espaçamento interno consistente (padding uniforme)
- Botões de ação com altura fixa e tamanho de toque adequado (mínimo 48px)
- Tipografia hierárquica (título grande, subtítulo médio, detalhe pequeno)
- Grid responsivo: 1 coluna em mobile, 2 em tablet, 3+ em desktop
- Sem cards "colados" nem muito separados — gap fixo de 12px mobile / 16px tablet

**Arquivo:** `artifacts/loto-shark/src/components/AllLotteriesCard.tsx`

Substitua o arquivo COMPLETO por:

```tsx
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLotteryTypes, useNextDrawInfo } from "@/hooks/useLotteryData";
import { getLocalDrawDate } from "@/lib/caixaApi";
import { Trophy, Clock, Zap, Target, ShoppingCart, Radio, Calendar } from "lucide-react";
import type { LotteryType } from "@/types/lottery";

// ─── Countdown hook ──────────────────────────────────────────────────────────
function useCountdown(drawDate?: string) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number; hours: number; minutes: number; seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!drawDate) return;
    const target = new Date(drawDate).getTime();
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setTimeLeft({
        days:    Math.floor(diff / 86400000),
        hours:   Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [drawDate]);

  return timeLeft;
}

// ─── Prize formatter ─────────────────────────────────────────────────────────
function formatPrize(value: string | number | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string" && value.startsWith("R$")) return value;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, ""));
  if (isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2,
  }).format(num);
}

// ─── Lottery visual config ───────────────────────────────────────────────────
const LOTTERY_CONFIG: Record<string, {
  emoji: string;
  prizeColor: string;
  accentColor: string;
  borderActive: string;
}> = {
  megasena:   { emoji: "💎", prizeColor: "text-emerald-400", accentColor: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400", borderActive: "border-emerald-500/40" },
  lotofacil:  { emoji: "⭐", prizeColor: "text-purple-400",  accentColor: "bg-purple-500/10 border-purple-500/25 text-purple-400",  borderActive: "border-purple-500/40"  },
  quina:      { emoji: "🪙", prizeColor: "text-yellow-400",  accentColor: "bg-yellow-500/10 border-yellow-500/25 text-yellow-400",  borderActive: "border-yellow-500/40"  },
  lotomania:  { emoji: "♾️", prizeColor: "text-pink-400",    accentColor: "bg-pink-500/10 border-pink-500/25 text-pink-400",        borderActive: "border-pink-500/40"    },
  duplasena:  { emoji: "👑", prizeColor: "text-orange-400",  accentColor: "bg-orange-500/10 border-orange-500/25 text-orange-400",  borderActive: "border-orange-500/40"  },
  timemania:  { emoji: "⚽", prizeColor: "text-rose-400",    accentColor: "bg-rose-500/10 border-rose-500/25 text-rose-400",        borderActive: "border-rose-500/40"    },
  diadesorte: { emoji: "🍀", prizeColor: "text-green-400",   accentColor: "bg-green-500/10 border-green-500/25 text-green-400",    borderActive: "border-green-500/40"   },
  supersete:  { emoji: "7️⃣", prizeColor: "text-red-400",    accentColor: "bg-red-500/10 border-red-500/25 text-red-400",           borderActive: "border-red-500/40"     },
};

function getCfg(id: string) {
  return LOTTERY_CONFIG[id] ?? {
    emoji: "🎰",
    prizeColor: "text-primary",
    accentColor: "bg-primary/10 border-primary/25 text-primary",
    borderActive: "border-primary/40",
  };
}

// ─── Skeleton card ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="rounded-2xl animate-pulse p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-28" />
          <div className="h-3 bg-white/10 rounded w-36" />
        </div>
      </div>
      <div className="h-8 bg-white/10 rounded-lg w-full" />
      <div className="h-3 bg-white/10 rounded w-32" />
      <div className="flex gap-2">
        <div className="h-11 bg-white/10 rounded-xl flex-1" />
        <div className="h-11 bg-white/10 rounded-xl flex-1" />
        <div className="h-11 bg-white/10 rounded-xl flex-1" />
      </div>
    </div>
  );
}

// ─── Single lottery card ─────────────────────────────────────────────────────
function SingleLotteryCard({ lottery }: { lottery: LotteryType }) {
  const [, setLocation] = useLocation();
  const { data: nextDraw, isLoading } = useNextDrawInfo(lottery.id);
  const cfg = getCfg(lottery.id);

  const drawDate = (() => {
    const apiDate  = nextDraw?.drawDate;
    const localDate = getLocalDrawDate(lottery.id) ?? undefined;
    if (apiDate && new Date(apiDate) > new Date()) return apiDate;
    return localDate;
  })();

  const timeLeft = useCountdown(drawDate);
  const prize    = formatPrize(nextDraw?.estimatedPrize);
  const hasPrize = prize !== "—";
  const isLive   = !!(nextDraw as any)?.isLive;

  const hasCountdown =
    timeLeft &&
    (timeLeft.days > 0 || timeLeft.hours > 0 || timeLeft.minutes > 0 || timeLeft.seconds > 0);

  if (isLoading) return <SkeletonCard />;

  return (
    <div
      className="rounded-2xl transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: isLive
          ? "1px solid rgba(239,68,68,0.5)"
          : "1px solid rgba(255,255,255,0.1)",
      }}
      data-testid={`lottery-card-${lottery.id}`}
    >
      {/* ── Topo: identidade ────────────────────────────────────────────── */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          {/* Emoji avatar */}
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            {cfg.emoji}
          </div>

          {/* Nome + regra */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-base font-bold text-white leading-tight truncate"
              data-testid={`lottery-name-${lottery.id}`}
            >
              {lottery.displayName}
            </h3>
            <p className="text-xs text-white/50 mt-0.5">
              {lottery.minNumbers}–{lottery.maxNumbers} números&nbsp;·&nbsp;
              {lottery.totalNumbers} disponíveis
            </p>
          </div>

          {/* Badge AO VIVO */}
          {isLive && (
            <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-full px-2.5 py-1 shrink-0">
              <Radio className="h-3 w-3 text-red-400 animate-pulse" />
              <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase">Live</span>
            </div>
          )}
        </div>

        {/* ── Prêmio ──────────────────────────────────────────────────── */}
        <div
          className="rounded-xl px-4 py-3 mb-3"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-medium">
            Prêmio Estimado
          </p>
          <p
            className={`text-2xl font-black tracking-tight leading-none ${
              hasPrize ? cfg.prizeColor : "text-white/30"
            }`}
            data-testid={`lottery-prize-${lottery.id}`}
          >
            {hasPrize ? prize : "Consulte a Caixa"}
          </p>
        </div>

        {/* ── Concurso + Countdown ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          {/* Número do concurso */}
          {nextDraw?.contestNumber ? (
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Concurso #{nextDraw.contestNumber}</span>
            </div>
          ) : (
            <div />
          )}

          {/* Countdown */}
          {isLive ? (
            <span className="text-xs font-bold text-red-400 animate-pulse">
              ● Sorteando agora
            </span>
          ) : hasCountdown && timeLeft ? (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5 text-white/40 shrink-0" />
              <span className="font-mono font-semibold text-yellow-400 tabular-nums">
                {String(timeLeft.days).padStart(2, "0")}d&nbsp;
                {String(timeLeft.hours).padStart(2, "0")}h&nbsp;
                {String(timeLeft.minutes).padStart(2, "0")}m&nbsp;
                {String(timeLeft.seconds).padStart(2, "0")}s
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Ações ───────────────────────────────────────────────────────── */}
      <div
        className="px-4 pb-4 pt-0 flex gap-2"
      >
        {/* Gerar */}
        <button
          className="flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.75)",
          }}
          onClick={() => setLocation(`/generator?lottery=${lottery.id}`)}
          data-testid={`quick-generate-${lottery.id}`}
        >
          <Zap className="h-4 w-4" />
          <span>Gerar</span>
        </button>

        {/* Mapa */}
        <button
          className="flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.75)",
          }}
          onClick={() => setLocation(`/heat-map?lottery=${lottery.id}`)}
          data-testid={`quick-heatmap-${lottery.id}`}
        >
          <Target className="h-4 w-4" />
          <span>Mapa</span>
        </button>

        {/* Carrinho */}
        <button
          className="flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.75)",
          }}
          onClick={() => setLocation(`/manual-picker?lottery=${lottery.id}`)}
          data-testid={`quick-cart-${lottery.id}`}
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Carrinho</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function AllLotteriesCard() {
  const { data: lotteryTypes, isLoading: lotteriesLoading } = useLotteryTypes();

  if (lotteriesLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (!lotteryTypes || lotteryTypes.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <Trophy className="h-8 w-8 mx-auto mb-3 text-white/20" />
        <p className="text-sm text-white/50 mb-4">Não foi possível carregar as modalidades</p>
        <button
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
          onClick={() => window.location.reload()}
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.25)" }}
          >
            <Trophy className="h-4 w-4 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">Todas as Modalidades</h2>
            <p className="text-[10px] text-white/40 mt-0.5">Próximos sorteios · IA integrada</p>
          </div>
        </div>
        <span
          className="text-[10px] font-medium px-2.5 py-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
        >
          {lotteryTypes.length} modalidades
        </span>
      </div>

      {/* Grid responsivo: 1 col mobile → 2 col tablet → 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lotteryTypes.map((lottery) => (
          <SingleLotteryCard key={lottery.id} lottery={lottery} />
        ))}
      </div>
    </div>
  );
}
```

---

## PROBLEMA 5 — RESPONSIVIDADE GLOBAL: CSS

**Arquivo:** `artifacts/loto-shark/src/index.css`

Localize o bloco `main {` e substitua **apenas esse bloco** por:

```css
main {
  min-height: calc(100vh - 140px);
  padding-top: 0.75rem;
  padding-bottom: 5rem; /* espaço para BottomNav mobile */
}

@media (min-width: 1024px) {
  main {
    padding-top: 1.5rem;
    padding-bottom: 3rem;
  }
}
```

Após o bloco `main`, adicione (se ainda não existir) o seguinte bloco de tipografia responsiva logo antes do `/* Cards específicos */`:

```css
/* ── Tipografia responsiva base ── */
html {
  font-size: 15px;
}
@media (min-width: 390px)  { html { font-size: 15.5px; } }
@media (min-width: 430px)  { html { font-size: 16px;   } }
@media (min-width: 768px)  { html { font-size: 16px;   } }
@media (min-width: 1024px) { html { font-size: 16px;   } }

/* ── Área de toque mínima (WCAG / Material Design) ── */
@media (pointer: coarse) {
  button, [role="button"], a {
    min-height: 44px;
    min-width: 44px;
  }
  /* Exceção: botões internos de grids de números */
  .number-grid button,
  .select-shark-list button {
    min-height: unset !important;
    min-width: unset !important;
  }
}

/* ── Container fluido seguro ── */
.container {
  width: 100%;
  max-width: min(100%, 480px);    /* mobile-first: máximo 480px */
  margin-left: auto;
  margin-right: auto;
  padding-left: 1rem;
  padding-right: 1rem;
}
@media (min-width: 640px) {
  .container {
    max-width: 768px;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }
}
@media (min-width: 1024px) {
  .container {
    max-width: 1200px;
    padding-left: 2rem;
    padding-right: 2rem;
  }
}
```

---

## PROBLEMA 6 — HOME.TSX: PADDING REMOVIDO QUE CAUSAVA CARDS COLADOS NO TOPO

**Arquivo:** `artifacts/loto-shark/src/pages/Home.tsx`

Localize a linha que contém `py-0` no `<main>`:
```tsx
<main className={`container mx-auto px-4 py-0 relative z-40 ${isMenuOpen ? 'hidden' : ''}`}>
```

Substitua por:
```tsx
<main className={`container mx-auto px-4 pt-3 pb-24 relative z-40 ${isMenuOpen ? 'hidden' : ''}`}>
```

---

## VERIFICAÇÃO FINAL

Após aplicar todas as correções, confirme:

1. **`caixaApi.ts`**: a função `apiFetch` importa e usa `resolveApiUrl` de `@/lib/queryClient`
2. **`render.yaml`**: tem `VITE_API_BASE_URL` como env do serviço frontend
3. **`app.ts`**: `allowedOrigins` inclui `/\.netlify\.app$/` e `/\.vercel\.app$/`
4. **`AllLotteriesCard.tsx`**: usa `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`
5. **`index.css`**: tem o bloco de tipografia responsiva e o `.container` com `max-width: min(100%, 480px)` para mobile
6. **`Home.tsx`**: `<main>` tem `pt-3 pb-24` (sem `py-0`)

---

## O QUE NÃO FAZER

- ❌ Não altere `package.json`, `tsconfig.json`, `vite.config.ts`
- ❌ Não altere o schema do banco (`lib/db/src/schema/index.ts`)
- ❌ Não instale novos pacotes npm
- ❌ Não altere `queryClient.ts` (ele já está correto)
- ❌ Não altere `lotteryData.ts` do backend (já tem fallback de API corrigido)
- ❌ Não altere `lottery.ts` das rotas do backend (já está correto)

---

## PROBLEMA 7 — 404 NO REFRESH (SPA no Render)

**Causa raiz:** O Render serve o frontend como site estático. Quando o usuário acessa diretamente uma URL como `/generator` ou `/heat-map` — seja por refresh, link direto ou volta do histórico do browser — o servidor procura um arquivo físico com aquele caminho, não encontra, e retorna 404. O React Router só funciona quando o `index.html` é sempre servido para qualquer rota.

Existem **três camadas** que precisam estar alinhadas ao mesmo tempo. Corrija todas:

---

### 7A — Arquivo `_redirects` (Render CDN)

**Arquivo:** `artifacts/loto-shark/public/_redirects`

Substitua o conteúdo COMPLETO do arquivo por:

```
/* /index.html 200
```

Apenas essa linha. Sem espaços extras, sem comentários, sem quebras de linha adicionais.

Esse arquivo precisa estar na pasta `public/` do Vite, que o Vite copia automaticamente para `dist/public/` durante o build. O Render lê esse arquivo e aplica o redirect antes de qualquer outra regra.

---

### 7B — `render.yaml` (regra de rewrite no serviço estático)

**Arquivo:** `render.yaml`

Substitua o arquivo COMPLETO por:

```yaml
services:
  # Frontend estático
  - type: web
    name: loto-shark-frontend
    runtime: static
    buildCommand: cd artifacts/loto-shark && npm install --legacy-peer-deps && npm run build
    staticPublishPath: artifacts/loto-shark/dist/public
    pullRequestPreviewsEnabled: false
    envVars:
      - key: VITE_API_BASE_URL
        sync: false
    headers:
      - path: /*
        name: Cache-Control
        value: no-cache, no-store, must-revalidate
    routes:
      - type: rewrite
        source: /*
        destination: /index.html

  # API backend
  - type: web
    name: loto-shark-api
    runtime: node
    buildCommand: cd artifacts/api-server && npm install --legacy-peer-deps && npm run build
    startCommand: node artifacts/api-server/dist/index.mjs
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 8080
```

A chave `headers` com `Cache-Control: no-cache` evita que o browser ou o CDN do Render sirva uma versão em cache do `index.html` antigo após um novo deploy.

---

### 7C — `vite.config.ts` (garantir que `public/` seja copiado corretamente)

**Arquivo:** `artifacts/loto-shark/vite.config.ts`

Localize o bloco `build:` e adicione `publicDir` explícito logo antes de `outDir`:

```typescript
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    // ...resto igual
  },
```

Adicione a linha `publicDir` no nível raiz do `defineConfig` (fora do `build`), logo após `root`:

```typescript
  root: path.resolve(import.meta.dirname),
  publicDir: path.resolve(import.meta.dirname, "public"),  // ← ADICIONAR ESTA LINHA
  build: {
```

Isso garante que o Vite sempre copia `public/_redirects` para `dist/public/_redirects` durante o build, mesmo em ambientes onde o `publicDir` padrão não é detectado corretamente.

---

### 7D — Verificar após o build

Após aplicar e rodar o build (`npm run build` dentro de `artifacts/loto-shark`), confirme que o arquivo existe:

```
artifacts/loto-shark/dist/public/_redirects
```

Conteúdo esperado:
```
/* /index.html 200
```

Se o arquivo **não estiver** em `dist/public/` após o build, significa que o Vite não está copiando a pasta `public/`. Nesse caso, adicione ao `buildCommand` do `render.yaml` um passo extra de cópia:

```yaml
    buildCommand: >
      cd artifacts/loto-shark &&
      npm install --legacy-peer-deps &&
      npm run build &&
      cp public/_redirects dist/public/_redirects
```

---

### Por que isso resolve o problema

| Camada | O que faz |
|---|---|
| `_redirects` | O CDN do Render intercepta ANTES do servidor e redireciona qualquer path para `/index.html` com status 200 |
| `routes` no `render.yaml` | Fallback no nível do serviço estático caso o `_redirects` não seja lido |
| `publicDir` no `vite.config.ts` | Garante que o `_redirects` chegue na pasta de output do build |
| `Cache-Control: no-cache` | Evita que o browser sirva o 404 cacheado após um novo deploy |

Com as três camadas alinhadas, qualquer refresh ou acesso direto a `/generator`, `/heat-map`, `/ai-analysis`, `/results` ou qualquer outra rota do React vai sempre receber o `index.html` e o React Router vai assumir a navegação corretamente.
