/**
 * caixaApi.ts — Camada de dados do frontend
 *
 * Todas as chamadas passam pelo NOSSO backend (/api/lotteries/...).
 * O backend busca a API da Caixa server-side (sem CORS), processa corretamente
 * os campos de prêmio e data/hora do próximo sorteio, e responde em JSON limpo.
 *
 * ✅ Sem chamadas diretas à Caixa no browser
 * ✅ Sem problemas de CORS
 * ✅ Countdown correto (calculado no backend com timezone BRT)
 * ✅ Prêmio correto (valorEstimadoProximoConcurso oficial)
 */

export const LOTTERIES = [
  { id: "megasena",   displayName: "Mega-Sena",    emoji: "💎", minNumbers: 6,  maxNumbers: 15, totalNumbers: 60,  drawDays: ["Terça","Quinta","Sábado"],           drawTime: "20:00", isActive: true },
  { id: "lotofacil",  displayName: "Lotofácil",    emoji: "⭐", minNumbers: 15, maxNumbers: 20, totalNumbers: 25,  drawDays: ["Seg","Ter","Qua","Qui","Sex","Sáb"], drawTime: "20:00", isActive: true },
  { id: "quina",      displayName: "Quina",        emoji: "🪙", minNumbers: 5,  maxNumbers: 15, totalNumbers: 80,  drawDays: ["Seg","Ter","Qua","Qui","Sex","Sáb"], drawTime: "20:00", isActive: true },
  { id: "lotomania",  displayName: "Lotomania",    emoji: "♾️", minNumbers: 50, maxNumbers: 50, totalNumbers: 100, drawDays: ["Seg","Qua","Sex"],                   drawTime: "20:00", isActive: true },
  { id: "duplasena",  displayName: "Dupla Sena",   emoji: "👑", minNumbers: 6,  maxNumbers: 15, totalNumbers: 50,  drawDays: ["Ter","Qui","Sáb"],                   drawTime: "20:00", isActive: true },
  { id: "timemania",  displayName: "Timemania",    emoji: "⚽", minNumbers: 10, maxNumbers: 10, totalNumbers: 80,  drawDays: ["Ter","Qui","Sáb"],                   drawTime: "20:00", isActive: true },
  { id: "diadesorte", displayName: "Dia de Sorte", emoji: "🍀", minNumbers: 7,  maxNumbers: 15, totalNumbers: 31,  drawDays: ["Ter","Qui","Sáb"],                   drawTime: "20:00", isActive: true },
  { id: "supersete",  displayName: "Super Sete",   emoji: "7️⃣", minNumbers: 7,  maxNumbers: 7,  totalNumbers: 10,  drawDays: ["Ter","Qui","Sáb"],                   drawTime: "20:00", isActive: true },
];

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

// ─── Fallback local para o countdown quando a API não responde ─────────────────

const DAY_MAP: Record<string, number> = {
  "domingo": 0, "sunday": 0,
  "segunda": 1, "segunda-feira": 1, "seg": 1, "monday": 1,
  "terça": 2, "terca": 2, "ter": 2, "tuesday": 2,
  "quarta": 3, "qua": 3, "wednesday": 3,
  "quinta": 4, "qui": 4, "thursday": 4,
  "sexta": 5, "sex": 5, "friday": 5,
  "sábado": 6, "sabado": 6, "sáb": 6, "saturday": 6,
};

function getNextDrawDateLocal(drawDays: string[], drawTime = "20:00"): Date {
  const BRT_OFFSET = 3 * 60 * 60 * 1000; // UTC-3
  const now = new Date();
  const brazilNow = new Date(now.getTime() - BRT_OFFSET);
  const today = brazilNow.getUTCDay();
  const [h, m] = drawTime.split(":").map(Number);
  const dayNums = drawDays.map(d => DAY_MAP[d.toLowerCase()] ?? -1).filter(d => d >= 0);
  if (dayNums.length === 0) dayNums.push(3);
  const brazilMinutes = brazilNow.getUTCHours() * 60 + brazilNow.getUTCMinutes();
  const drawMinutes = h * 60 + m;
  if (dayNums.includes(today) && brazilMinutes < drawMinutes - 5) {
    const d = new Date(now);
    d.setUTCHours(h + 3, m, 0, 0);
    return d;
  }
  let daysUntilNext = 7;
  for (const dayNum of dayNums) {
    let diff = dayNum - today;
    if (diff <= 0) diff += 7;
    if (diff < daysUntilNext) daysUntilNext = diff;
  }
  const next = new Date(brazilNow);
  next.setUTCDate(brazilNow.getUTCDate() + daysUntilNext);
  next.setUTCHours(h + 3, m, 0, 0);
  return next;
}

/** Retorna a data do próximo sorteio LOCAL (usado como fallback no componente). */
export function getLocalDrawDate(lotteryId: string): string | null {
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  if (!lottery) return null;
  return getNextDrawDateLocal(lottery.drawDays, lottery.drawTime).toISOString();
}

// ─── Funções públicas — chamam nosso backend ───────────────────────────────────

/** Último sorteio (normalizado). Usado em Resultados e similaridades. */
export async function getLotteryDraws(lotteryId: string) {
  const data = await apiFetch<any>(`/api/lotteries/${lotteryId}/draws`);
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * Informações do PRÓXIMO sorteio:
 * - contestNumber  → número real do próximo concurso (numeroConcursoProximo)
 * - drawDate       → ISO string com data+hora do sorteio (BRT→UTC, garantida futura)
 * - estimatedPrize → prêmio estimado formatado em BRL
 * - accumulated    → se está acumulado
 * - isLive         → se está no ar agora
 */
export async function getNextDraw(lotteryId: string) {
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  const data = await apiFetch<any>(`/api/lotteries/${lotteryId}/next-draw`);

  if (data) {
    // O backend já garante que drawDate é no futuro e o prêmio é correto.
    return {
      contestNumber:  data.contestNumber,
      drawDate:       data.drawDate,
      drawTime:       data.drawTime ?? "20:00",
      timeRemaining:  data.timeRemaining,
      estimatedPrize: data.estimatedPrize,
      isLive:         data.isLive ?? false,
      accumulated:    data.accumulated ?? false,
    };
  }

  // Fallback quando o backend não responde
  const fallbackDate = lottery
    ? getNextDrawDateLocal(lottery.drawDays, lottery.drawTime)
    : new Date(Date.now() + 86400000);
  const diff = Math.max(0, fallbackDate.getTime() - Date.now());
  return {
    contestNumber:  0,
    drawDate:       fallbackDate.toISOString(),
    drawTime:       lottery?.drawTime ?? "20:00",
    timeRemaining:  {
      days:    Math.floor(diff / 86400000),
      hours:   Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    },
    estimatedPrize: "—",
    isLive:         false,
    accumulated:    false,
  };
}

/** Prêmios do último sorteio (faixas). */
export async function getPrizes(lotteryId: string) {
  const data = await apiFetch<any>(`/api/lotteries/${lotteryId}/prizes`);
  if (!data) return null;
  return data;
}

/** Frequência histórica dos números. */
export async function getFrequencies(lotteryId: string, count = 30) {
  const data = await apiFetch<any>(`/api/lotteries/${lotteryId}/frequency`);
  if (!data) return { frequencies: [], meta: {} };
  return data;
}

/** Busca dados brutos do último sorteio (usado internamente). */
export async function getLatestDraw(lotteryId: string): Promise<any | null> {
  const draws = await apiFetch<any[]>(`/api/lotteries/${lotteryId}/draws`);
  if (!draws || draws.length === 0) return null;
  return draws[0];
}

/** Busca um sorteio específico pelo número do concurso. */
export async function getDraw(lotteryId: string, contest: number): Promise<number[] | null> {
  const draws = await getLotteryDraws(lotteryId);
  const found = draws?.find((d: any) => d.contestNumber === contest);
  return found?.drawnNumbers ?? null;
}
