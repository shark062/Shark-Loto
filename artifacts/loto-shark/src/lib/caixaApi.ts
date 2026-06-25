const CAIXA_BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";

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

function formatBRL(value: any): string {
  const n = Number(value);
  if (!n || n <= 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

async function fetchCaixa(path: string): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${CAIXA_BASE}/${path}`, {
      headers: { Accept: "application/json, text/plain, */*" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // timeout or network error — return null for fallback
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

export async function getLatestDraw(lotteryId: string): Promise<any | null> {
  return fetchCaixa(lotteryId);
}

export async function getDraw(lotteryId: string, contest: number): Promise<number[] | null> {
  const data = await fetchCaixa(`${lotteryId}/${contest}`);
  if (!data) return null;
  const nums = data.dezenas?.map(Number) ?? data.listaDezenas?.map(Number) ?? [];
  return nums.length > 0 ? nums : null;
}

export async function getLotteryDraws(lotteryId: string) {
  const data = await getLatestDraw(lotteryId);
  if (!data) return [];
  const numbers = data.dezenas?.map(Number) ?? data.listaDezenas?.map(Number) ?? [];
  return [{
    id: data.numero ?? 1,
    lotteryId,
    contestNumber: data.numero ?? 1,
    drawnNumbers: numbers,
    drawDate: data.dataApuracao ?? new Date().toISOString(),
    prizeAmount: formatBRL(data.valorArrecadado ?? data.premio),
    nextContestNumber: (data.numero ?? 1) + 1,
    estimatedPrize: formatBRL(data.valorEstimadoProximoConcurso),
    accumulated: data.acumulado ?? false,
  }];
}

const DAY_MAP: Record<string, number> = {
  "domingo": 0, "sunday": 0,
  "segunda": 1, "segunda-feira": 1, "seg": 1, "monday": 1,
  "terça": 2, "terca": 2, "ter": 2, "tuesday": 2,
  "quarta": 3, "qua": 3, "wednesday": 3,
  "quinta": 4, "qui": 4, "thursday": 4,
  "sexta": 5, "sex": 5, "friday": 5,
  "sábado": 6, "sabado": 6, "sáb": 6, "saturday": 6,
};

/**
 * Parses a Caixa date string "DD/MM/YYYY" and returns an ISO string
 * with 20:00 in Brazil time (UTC-3) → UTC+0 = 23:00.
 */
function parseCaixaDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  // 20:00 Brazil (UTC-3) = 23:00 UTC
  return `${yyyy}-${mm}-${dd}T23:00:00.000Z`;
}

export function getLocalDrawDate(lotteryId: string): string | null {
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  if (!lottery) return null;
  return getNextDrawDateLocal(lottery.drawDays, lottery.drawTime).toISOString();
}

function getNextDrawDateLocal(drawDays: string[], drawTime: string): Date {
  const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
  const now = new Date();
  const brazilNow = new Date(now.getTime() - BRAZIL_OFFSET_MS);
  const today = brazilNow.getUTCDay();
  const [h, m] = drawTime.split(":").map(Number);
  const drawDayNumbers = drawDays.map(d => DAY_MAP[d.toLowerCase()] ?? -1).filter(d => d >= 0);
  if (drawDayNumbers.length === 0) drawDayNumbers.push(3);
  const brazilMinutes = brazilNow.getUTCHours() * 60 + brazilNow.getUTCMinutes();
  const drawMinutes = h * 60 + m;
  if (drawDayNumbers.includes(today) && brazilMinutes < drawMinutes) {
    const d = new Date(now);
    d.setUTCHours(h + 3, m, 0, 0);
    return d;
  }
  let daysUntilNext = 7;
  for (const dayNum of drawDayNumbers) {
    let diff = dayNum - today;
    if (diff <= 0) diff += 7;
    if (diff < daysUntilNext) daysUntilNext = diff;
  }
  const next = new Date(brazilNow);
  next.setUTCDate(brazilNow.getUTCDate() + daysUntilNext);
  next.setUTCHours(h + 3, m, 0, 0);
  return next;
}

export async function getNextDraw(lotteryId: string) {
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  if (!lottery) return null;
  const data = await getLatestDraw(lotteryId);

  // Prefer the real date from Caixa; fall back to local calculation
  const caixaDateStr: string | null = data?.dataProximoConcurso ?? null;
  const parsedCaixaDate = caixaDateStr ? parseCaixaDate(caixaDateStr) : null;
  const nextDrawDate = parsedCaixaDate
    ? new Date(parsedCaixaDate)
    : getNextDrawDateLocal(lottery.drawDays, lottery.drawTime);

  return {
    contestNumber: data?.numeroConcursoProximo ?? (data?.numero ?? 0) + 1,
    drawDate: nextDrawDate.toISOString(),
    drawTime: lottery.drawTime,
    // timeRemaining is a snapshot — components should use useCountdown(drawDate) for live ticking
    timeRemaining: (() => {
      const diff = Math.max(0, nextDrawDate.getTime() - Date.now());
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      };
    })(),
    estimatedPrize: formatBRL(data?.valorEstimadoProximoConcurso),
    isLive: false,
    accumulated: data?.acumulado ?? false,
  };
}

export async function getPrizes(lotteryId: string) {
  const data = await getLatestDraw(lotteryId);
  if (!data) return null;
  const rawPrizes: any[] = data.listaRateioPremio ?? data.premiacao ?? data.premiacoes ?? [];
  const prizes = rawPrizes.map((p: any, i: number) => {
    const valor = p.valorPremio ?? p.valor ?? p.premio ?? p.valorLiquido ?? 0;
    const winners = p.numeroDeGanhadores ?? p.ganhadores ?? p.numeroPessoas ?? 0;
    const desc = p.descricaoFaixa ?? p.descricao ?? p.faixaDescricao ?? p.nome ?? `${i + 1}ª Faixa`;
    return {
      tier: i + 1,
      name: desc,
      winners: Number(winners),
      prizeAmount: Number(valor),
      prizeFormatted: Number(valor) > 0 ? formatBRL(valor) : "—",
      isAccumulated: Number(winners) === 0,
    };
  });
  const estimatedPrize = Number(data.valorEstimadoProximoConcurso ?? 0);
  return {
    lotteryId,
    contestNumber: data.numero ?? 0,
    nextContest: data.numeroConcursoProximo ?? (data.numero ?? 0) + 1,
    drawDate: data.dataApuracao ?? null,
    accumulated: data.acumulado ?? false,
    estimatedPrize,
    estimatedPrizeFormatted: estimatedPrize > 0 ? formatBRL(estimatedPrize) : "—",
    prizes,
  };
}

export async function getFrequencies(lotteryId: string, count = 30) {
  const lottery = LOTTERIES.find(l => l.id === lotteryId);
  if (!lottery) return { frequencies: [], meta: {} };
  const latest = await getLatestDraw(lotteryId);
  if (!latest) return { frequencies: [], meta: {} };
  const latestContest = latest.numero ?? 0;
  const latestNums = latest.dezenas?.map(Number) ?? latest.listaDezenas?.map(Number) ?? [];
  const draws: number[][] = latestNums.length > 0 ? [latestNums] : [];
  const targets: number[] = [];
  for (let i = 1; i < count && latestContest - i > 0; i++) targets.push(latestContest - i);
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(n => getDraw(lotteryId, n)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) draws.push(r.value);
    }
    if (draws.length >= count) break;
  }
  const totalNums = lottery.totalNumbers;
  const freq: Record<number, number> = {};
  const recentFreq: Record<number, number> = {};
  for (let i = 1; i <= totalNums; i++) { freq[i] = 0; recentFreq[i] = 0; }
  draws.forEach(d => d.forEach(n => { if (freq[n] !== undefined) freq[n]++; }));
  const recentDraws = draws.slice(0, Math.min(10, draws.length));
  recentDraws.forEach(d => d.forEach(n => { if (recentFreq[n] !== undefined) recentFreq[n]++; }));
  const allNums = Array.from({ length: totalNums }, (_, i) => i + 1);
  const sortedByRecent = [...allNums].sort((a, b) => recentFreq[b] - recentFreq[a]);
  const hotCut = Math.floor(totalNums * 0.33);
  const hotSet = new Set(sortedByRecent.slice(0, hotCut));
  const delayMap: Record<number, number> = {};
  for (let n = 1; n <= totalNums; n++) { const idx = draws.findIndex(d => d.includes(n)); delayMap[n] = idx === -1 ? draws.length : idx; }
  const sortedByDelay = [...allNums].sort((a, b) => delayMap[b] - delayMap[a]);
  const coldSet = new Set(sortedByDelay.slice(0, Math.floor(totalNums * 0.33)));
  const totalDraws = Math.max(draws.length, 1);
  const recentTotal = Math.max(recentDraws.length, 1);
  const sorted = [...allNums].sort((a, b) => freq[b] - freq[a]);
  const rankMap: Record<number, number> = {};
  sorted.forEach((n, i) => { rankMap[n] = i + 1; });
  const frequencies = allNums.map(n => {
    const isHot = hotSet.has(n) && !coldSet.has(n);
    const isCold = coldSet.has(n) && !hotSet.has(n);
    const temperature: "hot" | "warm" | "cold" = isHot ? "hot" : isCold ? "cold" : "warm";
    return { number: n, frequency: freq[n], recentFrequency: recentFreq[n], delay: delayMap[n], percentage: Math.round((freq[n] / totalDraws) * 100), recentPercentage: Math.round((recentFreq[n] / recentTotal) * 100), temperature, rank: rankMap[n], isHot: temperature === "hot", isCold: temperature === "cold" };
  }).sort((a, b) => b.frequency - a.frequency);
  return { frequencies, meta: { lotteryId, totalNumbers: totalNums, drawsAnalyzed: draws.length } };
}
