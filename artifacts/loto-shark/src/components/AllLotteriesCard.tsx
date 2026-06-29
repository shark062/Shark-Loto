import { useLocation } from "wouter";
import { useState, useEffect } from "react";
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
  glowColor: string;
}> = {
  megasena:   { emoji: "💎", prizeColor: "#34d399", glowColor: "rgba(52,211,153,0.3)"  },
  lotofacil:  { emoji: "⭐", prizeColor: "#c084fc", glowColor: "rgba(192,132,252,0.3)" },
  quina:      { emoji: "🪙", prizeColor: "#fbbf24", glowColor: "rgba(251,191,36,0.3)"  },
  lotomania:  { emoji: "♾️", prizeColor: "#f472b6", glowColor: "rgba(244,114,182,0.3)" },
  duplasena:  { emoji: "👑", prizeColor: "#fb923c", glowColor: "rgba(251,146,60,0.3)"  },
  timemania:  { emoji: "⚽", prizeColor: "#f87171", glowColor: "rgba(248,113,113,0.3)" },
  diadesorte: { emoji: "🍀", prizeColor: "#4ade80", glowColor: "rgba(74,222,128,0.3)"  },
  supersete:  { emoji: "7️⃣", prizeColor: "#ff6b6b", glowColor: "rgba(255,107,107,0.3)"},
};

function getCfg(id: string) {
  return LOTTERY_CONFIG[id] ?? {
    emoji: "🎰", prizeColor: "#a78bfa", glowColor: "rgba(167,139,250,0.3)",
  };
}

// ─── Skeleton card ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="sk-skeleton p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="sk-avatar sk-skeleton__bar" style={{ fontSize: 0 }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 sk-skeleton__bar rounded w-28" />
          <div className="h-3 sk-skeleton__bar rounded w-36" />
        </div>
      </div>
      <div className="h-16 sk-skeleton__bar rounded-xl w-full" />
      <div className="h-3 sk-skeleton__bar rounded w-32" />
      <div className="flex gap-2">
        <div className="h-11 sk-skeleton__bar rounded-xl flex-1" />
        <div className="h-11 sk-skeleton__bar rounded-xl flex-1" />
        <div className="h-11 sk-skeleton__bar rounded-xl flex-1" />
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
    const apiDate   = nextDraw?.drawDate;
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
      className={`sk-card transition-all duration-200${isLive ? " sk-card--live" : ""}`}
      data-testid={`lottery-card-${lottery.id}`}
    >
      {/* ── Topo: identidade ──────────────────────────────────────────── */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          {/* Emoji avatar */}
          <div className="sk-avatar">
            {cfg.emoji}
          </div>

          {/* Nome + regra */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-base font-bold leading-tight truncate"
              style={{ color: "#ffffff" }}
              data-testid={`lottery-name-${lottery.id}`}
            >
              {lottery.displayName}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.72rem" }} className="mt-0.5">
              {lottery.minNumbers}–{lottery.maxNumbers} números&nbsp;·&nbsp;
              {lottery.totalNumbers} disponíveis
            </p>
          </div>

          {/* Badge AO VIVO */}
          {isLive && (
            <div className="flex items-center gap-1 rounded-full px-2.5 py-1 shrink-0"
              style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)" }}>
              <Radio className="h-3 w-3 animate-pulse" style={{ color: "#f87171" }} />
              <span style={{ color: "#f87171", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em" }}>LIVE</span>
            </div>
          )}
        </div>

        {/* ── Prêmio ────────────────────────────────────────────────── */}
        <div
          className="rounded-xl px-4 py-3 mb-3"
          style={{
            background: hasPrize ? `rgba(5,12,35,0.7)` : "rgba(255,255,255,0.05)",
            border: hasPrize ? `1px solid ${cfg.glowColor}` : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "4px", fontWeight: 500 }}>
            Prêmio Estimado
          </p>
          <p
            className="font-black tracking-tight leading-none"
            style={{
              color: hasPrize ? cfg.prizeColor : "rgba(255,255,255,0.35)",
              fontSize: hasPrize ? "1.35rem" : "0.95rem",
              textShadow: hasPrize ? `0 0 20px ${cfg.glowColor}` : "none",
            }}
            data-testid={`lottery-prize-${lottery.id}`}
          >
            {hasPrize ? prize : "Consulte a Caixa"}
          </p>
        </div>

        {/* ── Concurso + Countdown ──────────────────────────────────── */}
        <div className="flex items-center justify-between min-h-[20px]">
          {nextDraw?.contestNumber ? (
            <div className="flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.72rem" }}>
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Concurso #{nextDraw.contestNumber}</span>
            </div>
          ) : (
            <div />
          )}

          {isLive ? (
            <span className="animate-pulse font-bold" style={{ color: "#f87171", fontSize: "0.72rem" }}>
              ● Sorteando agora
            </span>
          ) : hasCountdown && timeLeft ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }} />
              <span
                className="font-mono font-bold tabular-nums"
                style={{ color: "#fbbf24", fontSize: "0.72rem" }}
              >
                {String(timeLeft.days).padStart(2, "0")}d&nbsp;
                {String(timeLeft.hours).padStart(2, "0")}h&nbsp;
                {String(timeLeft.minutes).padStart(2, "0")}m&nbsp;
                {String(timeLeft.seconds).padStart(2, "0")}s
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Ações ─────────────────────────────────────────────────────── */}
      <div
        className="flex overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "4px" }}
      >
        {[
          { icon: <Zap className="h-4 w-4" />, label: "Gerar",     path: `/generator?lottery=${lottery.id}`,     testId: `quick-generate-${lottery.id}` },
          { icon: <Target className="h-4 w-4" />, label: "Mapa",   path: `/heat-map?lottery=${lottery.id}`,      testId: `quick-heatmap-${lottery.id}` },
          { icon: <ShoppingCart className="h-4 w-4" />, label: "Carrinho", path: `/manual-picker?lottery=${lottery.id}`, testId: `quick-cart-${lottery.id}` },
        ].map(({ icon, label, path, testId }) => (
          <button
            key={label}
            className="sk-action-btn"
            onClick={() => setLocation(path)}
            data-testid={testId}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function AllLotteriesCard() {
  const { data: lotteryTypes, isLoading: lotteriesLoading } = useLotteryTypes();

  if (lotteriesLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (!lotteryTypes || lotteryTypes.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: "rgba(5,10,30,0.75)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Trophy className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.3)" }} />
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>Não foi possível carregar as modalidades</p>
        <button
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", color: "white" }}
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
            style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)" }}
          >
            <Trophy className="h-4 w-4" style={{ color: "#fbbf24" }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: "#ffffff" }}>Todas as Modalidades</h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.65rem" }} className="mt-0.5">
              Próximos sorteios · IA integrada
            </p>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.6)",
            fontSize: "0.65rem",
            fontWeight: 500,
          }}
        >
          {lotteryTypes.length} modalidades
        </span>
      </div>

      {/* Grid responsivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lotteryTypes.map((lottery) => (
          <SingleLotteryCard key={lottery.id} lottery={lottery} />
        ))}
      </div>
    </div>
  );
}
