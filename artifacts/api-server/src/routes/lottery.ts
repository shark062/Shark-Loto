import { Router } from "express";
import { LOTTERIES, fetchLatestDraw, fetchHistoricalDraws, computeFrequencies } from "../lib/lotteryData";

const router = Router();

function formatBRL(value: any): string {
  const n = Number(value);
  if (!n || n <= 0) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n);
}

function normalizeDrawData(data: any, lotteryId: string) {
  if (!data) return null;
  const numbers = data.dezenas?.map(Number) || data.listaDezenas?.map(Number) || data.numbers || [];
  return {
    id: data.numero || data.contestNumber || 1,
    lotteryId,
    contestNumber: data.numero || data.contestNumber || 1,
    drawnNumbers: numbers,
    drawDate: data.dataApuracao || data.data || data.drawDate || new Date().toISOString(),
    prizeAmount: formatBRL(data.valorArrecadado ?? data.premio ?? data.prizeAmount),
    nextContestNumber: (data.numero || 1) + 1,
    estimatedPrize: formatBRL(data.valorEstimadoProximoConcurso),
    accumulated: data.acumulado ?? false,
  };
}

/**
 * Converte data no formato "DD/MM/YYYY" para um Date UTC no horário do sorteio (Brasília = UTC-3).
 */
function parseCaixaDate(dateStr: string, drawTime: string): Date | null {
  if (!dateStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  const [h, m] = drawTime.split(':').map(Number);
  // Horário de Brasília é UTC-3: para UTC somamos 3h
  const utc = new Date(Date.UTC(year, month - 1, day, h + 3, m, 0, 0));
  return isNaN(utc.getTime()) ? null : utc;
}

function getNextDrawDate(drawDays: string[], drawTime: string, caixaNextDate?: string | null): Date {
  // Prioridade 1: usa data real da Caixa (evita erros por feriados/remarcações)
  if (caixaNextDate) {
    const parsed = parseCaixaDate(caixaNextDate, drawTime);
    if (parsed && parsed.getTime() > Date.now()) return parsed;
  }

  const dayMap: Record<string, number> = {
    'domingo': 0, 'sunday': 0, 'dom': 0,
    'segunda': 1, 'segunda-feira': 1, 'seg': 1, 'monday': 1,
    'terça': 2, 'terca': 2, 'ter': 2, 'tuesday': 2,
    'quarta': 3, 'qua': 3, 'wednesday': 3,
    'quinta': 4, 'qui': 4, 'thursday': 4,
    'sexta': 5, 'sex': 5, 'friday': 5,
    'sábado': 6, 'sabado': 6, 'sáb': 6, 'saturday': 6,
  };

  // Horário de Brasília = UTC-3
  const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
  const now = new Date();
  const brazilNow = new Date(now.getTime() - BRAZIL_OFFSET_MS);
  const today = brazilNow.getUTCDay();
  const [h, m] = drawTime.split(':').map(Number);

  const drawDayNumbers = drawDays.map(d => dayMap[d.toLowerCase()] ?? -1).filter(d => d >= 0);
  if (drawDayNumbers.length === 0) drawDayNumbers.push(3);

  const brazilH = brazilNow.getUTCHours();
  const brazilMin = brazilNow.getUTCMinutes();
  const minutesFromMidnight = brazilH * 60 + brazilMin;
  const drawMinutes = h * 60 + m;

  const LIVE_BEFORE_MIN = 30;
  const LIVE_AFTER_MIN = 90;

  if (drawDayNumbers.includes(today)) {
    // Ainda antes do sorteio de hoje
    if (minutesFromMidnight < drawMinutes - LIVE_BEFORE_MIN) {
      const todayDraw = new Date(now);
      todayDraw.setUTCHours(h + 3, m, 0, 0);
      return todayDraw;
    }
    // Dentro da janela ao vivo (inclui antes + logo depois)
    if (minutesFromMidnight <= drawMinutes + LIVE_AFTER_MIN) {
      const todayDraw = new Date(now);
      todayDraw.setUTCHours(h + 3, m, 0, 0);
      return todayDraw;
    }
  }

  // Próximo dia de sorteio (considerando todos os dias da semana)
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

function getIsLive(drawDays: string[], drawTime: string): boolean {
  const dayMap: Record<string, number> = {
    'domingo': 0, 'sunday': 0, 'dom': 0,
    'segunda': 1, 'segunda-feira': 1, 'seg': 1, 'monday': 1,
    'terça': 2, 'terca': 2, 'ter': 2, 'tuesday': 2,
    'quarta': 3, 'qua': 3, 'wednesday': 3,
    'quinta': 4, 'qui': 4, 'thursday': 4,
    'sexta': 5, 'sex': 5, 'friday': 5,
    'sábado': 6, 'sabado': 6, 'sáb': 6, 'saturday': 6,
  };
  const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
  const now = new Date();
  const brazilNow = new Date(now.getTime() - BRAZIL_OFFSET_MS);
  const today = brazilNow.getUTCDay();
  const [h, m] = drawTime.split(':').map(Number);
  const drawDayNumbers = drawDays.map(d => dayMap[d.toLowerCase()] ?? -1).filter(d => d >= 0);
  if (!drawDayNumbers.includes(today)) return false;
  const minutesFromMidnight = brazilNow.getUTCHours() * 60 + brazilNow.getUTCMinutes();
  const drawMinutes = h * 60 + m;
  return minutesFromMidnight >= drawMinutes - 30 && minutesFromMidnight <= drawMinutes + 90;
}

function getIsLiveVerified(data: any, drawTime: string): boolean {
  if (!data) return false;
  const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
  const now = new Date();
  const brazilNow = new Date(now.getTime() - BRAZIL_OFFSET_MS);

  const dd    = brazilNow.getUTCDate().toString().padStart(2, '0');
  const mm    = (brazilNow.getUTCMonth() + 1).toString().padStart(2, '0');
  const yyyy  = brazilNow.getUTCFullYear();
  const todayStr = `${dd}/${mm}/${yyyy}`;

  const [h, m] = drawTime.split(':').map(Number);
  const drawMinutes = h * 60 + m;
  const minutesNow  = brazilNow.getUTCHours() * 60 + brazilNow.getUTCMinutes();

  if (data.dataProximoConcurso === todayStr) {
    return minutesNow >= drawMinutes - 30 && minutesNow <= drawMinutes + 90;
  }
  if (data.dataApuracao === todayStr) {
    return minutesNow >= drawMinutes && minutesNow <= drawMinutes + 90;
  }
  return false;
}

// GET /api/lotteries
router.get("/", (req, res) => {
  res.json(LOTTERIES);
});

// GET /api/lotteries/live-status
router.get("/live-status", async (req, res) => {
  const candidates = LOTTERIES.filter(l => getIsLive(l.drawDays, l.drawTime));

  if (candidates.length === 0) {
    res.json({ isLive: false, activeLotteries: [] }); return;
  }

  const activeLotteries: string[] = [];

  await Promise.allSettled(
    candidates.map(async l => {
      try {
        const data = await fetchLatestDraw(l.id);
        if (getIsLiveVerified(data, l.drawTime)) {
          activeLotteries.push(l.id);
        }
      } catch {}
    })
  );

  res.json({ isLive: activeLotteries.length > 0, activeLotteries });
});

// GET /api/lotteries/:id
router.get("/:id", async (req, res) => {
  const lottery = LOTTERIES.find(l => l.id === req.params.id);
  if (!lottery) { res.status(404).json({ message: 'Lottery not found' }); return; }
  res.json(lottery);
});

async function drawsHandler(req: any, res: any) {
  const lottery = LOTTERIES.find(l => l.id === req.params.id);
  if (!lottery) { res.status(404).json({ message: 'Lottery not found' }); return; }
  try {
    const data = await fetchLatestDraw(req.params.id);
    const normalized = normalizeDrawData(data, req.params.id);
    res.json(normalized ? [normalized] : []);
  } catch {
    res.json([]);
  }
}

router.get("/:id/draws", drawsHandler);
router.get("/:id/draws/:extra", drawsHandler);

// GET /api/lotteries/:id/next-draw
router.get("/:id/next-draw", async (req, res) => {
  const lottery = LOTTERIES.find(l => l.id === req.params.id);
  if (!lottery) { res.status(404).json({ message: 'Lottery not found' }); return; }

  try {
    const data = await fetchLatestDraw(req.params.id);
    const caixaNextDate: string | null = data?.dataProximoConcurso || null;

    // Usa data real da Caixa quando disponível (mais preciso, evita erros em feriados)
    const nextDrawDate = getNextDrawDate(lottery.drawDays, lottery.drawTime, caixaNextDate);
    const now = new Date();
    const diff = Math.max(0, nextDrawDate.getTime() - now.getTime());

    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const contestNumber  = data?.numeroConcursoProximo ?? ((data?.numero ?? 0) + 1);
    const accumulated    = data?.acumulado ?? false;

    // Prêmio: usa o valor estimado para o próximo concurso.
    // Quando acumulado, prefere o maior entre o estimado e o acumulado.
    const estimatedRaw  = Number(data?.valorEstimadoProximoConcurso ?? 0);
    const acumuladoRaw  = Number(data?.valorAcumuladoProximoConcurso ?? 0);
    const prizeRaw      = accumulated && acumuladoRaw > estimatedRaw ? acumuladoRaw : estimatedRaw;
    const estimatedPrize = formatBRL(prizeRaw > 0 ? prizeRaw : estimatedRaw);

    const isLive = getIsLiveVerified(data, lottery.drawTime);

    res.json({
      contestNumber,
      drawDate: nextDrawDate.toISOString(),
      drawTime: lottery.drawTime,
      timeRemaining: { days, hours, minutes, seconds },
      estimatedPrize,
      isLive,
      accumulated,
      nextDrawDateCaixa: caixaNextDate,
    });
  } catch {
    // Fallback sem API da Caixa
    const nextDrawDate = getNextDrawDate(lottery.drawDays, lottery.drawTime, null);
    const now = new Date();
    const diff = Math.max(0, nextDrawDate.getTime() - now.getTime());
    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    const isLive  = getIsLive(lottery.drawDays, lottery.drawTime);
    res.json({
      contestNumber: 1,
      drawDate: nextDrawDate.toISOString(),
      drawTime: lottery.drawTime,
      timeRemaining: { days, hours, minutes, seconds },
      estimatedPrize: 'R$ 0,00',
      isLive,
      nextDrawDateCaixa: null,
    });
  }
});

// GET /api/lotteries/:id/prizes
router.get("/:id/prizes", async (req, res) => {
  const lottery = LOTTERIES.find(l => l.id === req.params.id);
  if (!lottery) { res.status(404).json({ message: 'Lottery not found' }); return; }

  try {
    const data = await fetchLatestDraw(req.params.id);
    if (!data) { res.status(503).json({ message: 'Dados indisponíveis no momento' }); return; }

    const contestNumber   = data.numero || data.contestNumber || 0;
    const nextContest     = contestNumber + 1;
    const estimatedPrize  = data.valorEstimadoProximoConcurso || 0;
    const drawDate        = data.dataApuracao || data.data || null;
    const accumulated     = data.acumulado ?? false;

    const rawPrizes: any[] = data.premiacao || data.premiacoes || data.listaRateioPremio || [];

    const prizes = rawPrizes.map((p: any, i: number) => {
      const valor   = p.valorPremio ?? p.valor ?? p.premio ?? p.valorLiquido ?? 0;
      const winners = p.ganhadores ?? p.numeroPessoas ?? p.vencedores ?? 0;
      const desc    = p.descricao ?? p.faixaDescricao ?? p.nome ?? `${i + 1}ª Faixa`;
      return {
        tier: i + 1,
        name: desc,
        winners: Number(winners),
        prizeAmount: Number(valor),
        prizeFormatted: Number(valor) > 0
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(Number(valor))
          : '—',
        isAccumulated: Number(winners) === 0,
      };
    });

    res.json({
      lotteryId: req.params.id,
      contestNumber,
      nextContest,
      drawDate,
      accumulated,
      estimatedPrize: Number(estimatedPrize),
      estimatedPrizeFormatted: Number(estimatedPrize) > 0
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(Number(estimatedPrize))
        : '—',
      prizes,
    });
  } catch {
    res.status(503).json({ message: 'Erro ao buscar prêmios.' });
  }
});

// GET /api/lotteries/:id/frequency
router.get("/:id/frequency", async (req, res) => {
  const lottery = LOTTERIES.find(l => l.id === req.params.id);
  if (!lottery) { res.status(404).json({ message: 'Lottery not found' }); return; }

  try {
    const draws       = await fetchHistoricalDraws(req.params.id, 30);
    const frequencies = computeFrequencies(lottery.totalNumbers, draws);

    const hot  = frequencies.filter(f => f.temperature === 'hot');
    const cold = frequencies.filter(f => f.temperature === 'cold');
    const warm = frequencies.filter(f => f.temperature === 'warm');

    res.json({
      frequencies,
      meta: {
        lotteryId: lottery.id,
        totalNumbers: lottery.totalNumbers,
        minNumbers: lottery.minNumbers,
        drawsAnalyzed: draws.length,
        recentWindow: Math.min(10, draws.length),
        topHot:  hot.slice(0, 10).map(f => f.number),
        topCold: cold.slice(0, 10).map(f => f.number),
        topWarm: warm.slice(0, 10).map(f => f.number),
        topFrequency: frequencies.slice(0, 15).map(f => ({ number: f.number, frequency: f.frequency, temperature: f.temperature })),
      },
    });
  } catch {
    res.json({ frequencies: computeFrequencies(lottery.totalNumbers, []), meta: {} });
  }
});

// GET /api/lotteries/:id/history
router.get("/:id/history", async (req, res) => {
  const lottery = LOTTERIES.find(l => l.id === req.params.id);
  if (!lottery) { res.status(404).json({ message: 'Lottery not found' }); return; }

  try {
    const count = Math.min(parseInt(req.query.count as string) || 20, 50);
    const draws = await fetchHistoricalDraws(req.params.id, count);
    res.json({ lotteryId: req.params.id, drawCount: draws.length, draws });
  } catch {
    res.json({ lotteryId: req.params.id, drawCount: 0, draws: [] });
  }
});


export default router;
