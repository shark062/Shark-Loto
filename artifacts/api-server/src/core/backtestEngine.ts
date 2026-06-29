// ============================================================
//  Backtest Engine — Testa estratégias contra concursos reais
//  Calcula: média de acertos, melhor desempenho, estabilidade,
//  confiança por estratégia.
// ============================================================

export interface BacktestResult {
  strategy:    string;
  averageHits: number;
  bestScore:   number;
  worstScore:  number;
  stability:   number;  // 0–1 (desvio padrão inverso normalizado)
  confidence:  number;  // 0–1 score composto
  sampleSize:  number;
}

export interface BacktestReport {
  results:     BacktestResult[];
  bestStrategy: string;
  testedAt:    number;
}

// Stratégia → função geradora de jogo dado hot/cold/warm
type StrategyFn = (
  hot: number[], cold: number[], warm: number[],
  minNumbers: number, totalNumbers: number
) => number[];

// Utilitários
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function completeGame(partial: number[], total: number, min: number): number[] {
  const set = new Set(partial);
  if (set.size >= min) return [...set].sort((a, b) => a - b).slice(0, min);
  const pool = Array.from({ length: total }, (_, i) => i + 1).filter(n => !set.has(n));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const n of shuffled) {
    set.add(n);
    if (set.size >= min) break;
  }
  return [...set].sort((a, b) => a - b).slice(0, min);
}

function countHits(game: number[], draw: number[]): number {
  const s = new Set(draw);
  return game.filter(n => s.has(n)).length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Estratégias internas para backtest
const STRATEGIES: Record<string, StrategyFn> = {
  impulso: (hot, cold, warm, min, total) => {
    const hotQ  = Math.ceil(min * 0.50);
    const coldQ = Math.ceil(min * 0.25);
    const base  = [...pickN(hot, hotQ), ...pickN(cold, coldQ), ...pickN(warm, min - hotQ - coldQ)];
    return completeGame([...new Set(base)], total, min);
  },
  compensacao: (hot, cold, warm, min, total) => {
    const coldQ = Math.ceil(min * 0.50);
    const hotQ  = Math.ceil(min * 0.25);
    const base  = [...pickN(cold, coldQ), ...pickN(hot, hotQ), ...pickN(warm, min - coldQ - hotQ)];
    return completeGame([...new Set(base)], total, min);
  },
  equilibrio: (hot, cold, warm, min, total) => {
    const t = Math.floor(min / 3);
    const base = [...pickN(hot, t), ...pickN(cold, t), ...pickN(warm, min - t * 2)];
    return completeGame([...new Set(base)], total, min);
  },
  quente_puro: (hot, _cold, _warm, min, total) => {
    return completeGame(pickN(hot, min), total, min);
  },
  frio_puro: (_hot, cold, _warm, min, total) => {
    return completeGame(pickN(cold, min), total, min);
  },
};

/**
 * Executa backtest para todas as estratégias usando os `draws` reais.
 * Usa `testWindow` sorteios mais antigos como "resultados" e gera jogos
 * com base nos `trainWindow` sorteios anteriores a cada ponto de teste.
 */
export function runBacktest(
  draws: number[][],
  totalNumbers: number,
  minNumbers: number,
  trainWindow: number = 10,
  testWindow: number = 5,
  gamesPerPoint: number = 3,
): BacktestReport {
  const results: BacktestResult[] = [];

  for (const [stratName, stratFn] of Object.entries(STRATEGIES)) {
    const hitsList: number[] = [];

    for (let t = 0; t < testWindow && t + trainWindow < draws.length; t++) {
      const trainDraws = draws.slice(t + 1, t + 1 + trainWindow);
      const testDraw   = draws[t];

      // Calcular hot/cold/warm com base nos draws de treino
      const freq: Record<number, number> = {};
      const recent: Record<number, number> = {};
      const delay: Record<number, number> = {};

      for (let n = 1; n <= totalNumbers; n++) freq[n] = 0;
      trainDraws.forEach(d => d.forEach(n => { if (freq[n] !== undefined) freq[n]++; }));
      trainDraws.slice(0, 5).forEach(d => d.forEach(n => { if (recent[n] !== undefined) recent[n]++; }));
      for (let n = 1; n <= totalNumbers; n++) {
        const idx = trainDraws.findIndex(d => d.includes(n));
        delay[n] = idx === -1 ? trainDraws.length : idx;
      }

      const nums    = Array.from({ length: totalNumbers }, (_, i) => i + 1);
      const byRecent = [...nums].sort((a, b) => (recent[b] || 0) - (recent[a] || 0));
      const byDelay  = [...nums].sort((a, b) => (delay[b]  || 0) - (delay[a]  || 0));
      const hotCut   = Math.floor(totalNumbers * 0.33);
      const coldCut  = Math.floor(totalNumbers * 0.33);
      const hotSet   = new Set(byRecent.slice(0, hotCut));
      const coldSet  = new Set(byDelay.slice(0, coldCut));

      const hot: number[] = [], cold: number[] = [], warm: number[] = [];
      for (const n of nums) {
        if (hotSet.has(n) && !coldSet.has(n)) hot.push(n);
        else if (coldSet.has(n) && !hotSet.has(n)) cold.push(n);
        else if (hotSet.has(n) && coldSet.has(n)) ((recent[n] || 0) >= 2 ? hot : cold).push(n);
        else warm.push(n);
      }

      // Gerar vários jogos e pegar o de melhor acerto
      let bestHits = 0;
      for (let g = 0; g < gamesPerPoint; g++) {
        const game = stratFn(hot, cold, warm, minNumbers, totalNumbers);
        const hits = countHits(game, testDraw);
        if (hits > bestHits) bestHits = hits;
      }
      hitsList.push(bestHits);
    }

    if (hitsList.length === 0) continue;

    const avg      = hitsList.reduce((a, b) => a + b, 0) / hitsList.length;
    const best     = Math.max(...hitsList);
    const worst    = Math.min(...hitsList);
    const sd       = stdDev(hitsList);
    const stability = Math.max(0, 1 - sd / (minNumbers / 2));

    // Confidence: peso de acerto médio + estabilidade
    const confidence = Math.min(1, (avg / minNumbers) * 0.6 + stability * 0.4);

    results.push({ strategy: stratName, averageHits: avg, bestScore: best, worstScore: worst, stability, confidence, sampleSize: hitsList.length });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  const bestStrategy = results[0]?.strategy ?? 'equilibrio';

  return { results, bestStrategy, testedAt: Date.now() };
}
