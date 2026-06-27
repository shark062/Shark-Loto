// ============================================================
//  Statistical Engine — Motor Estatístico Avançado v3.1
//  Melhorias: pesos recalibrados, score de momentum,
//  janela composta ajustada para maior assertividade.
// ============================================================

// ============================================================
//  1. CONFIGURAÇÕES POR MODALIDADE
// ============================================================

export interface LotteryConfig {
  id: string;
  totalNumbers: number;
  minNumbers: number;
  sumMin: number;
  sumMax: number;
  sumIdeal: number;
  evenMin: number;
  evenMax: number;
  maxSeqLength: number;
  groups: number;
}

export const LOTTERY_CONFIGS: Record<string, LotteryConfig> = {
  megasena: {
    id: 'megasena', totalNumbers: 60, minNumbers: 6,
    sumMin: 95, sumMax: 280, sumIdeal: 180,
    evenMin: 2, evenMax: 4, maxSeqLength: 2, groups: 6,
  },
  lotofacil: {
    id: 'lotofacil', totalNumbers: 25, minNumbers: 15,
    sumMin: 145, sumMax: 250, sumIdeal: 195,
    evenMin: 6, evenMax: 9, maxSeqLength: 5, groups: 5,
  },
  quina: {
    id: 'quina', totalNumbers: 80, minNumbers: 5,
    sumMin: 75, sumMax: 340, sumIdeal: 205,
    evenMin: 2, evenMax: 3, maxSeqLength: 2, groups: 8,
  },
  lotomania: {
    id: 'lotomania', totalNumbers: 100, minNumbers: 50,
    sumMin: 1850, sumMax: 3200, sumIdeal: 2525,
    evenMin: 23, evenMax: 27, maxSeqLength: 10, groups: 10,
  },
  duplasena: {
    id: 'duplasena', totalNumbers: 50, minNumbers: 6,
    sumMin: 70, sumMax: 230, sumIdeal: 153,
    evenMin: 2, evenMax: 4, maxSeqLength: 2, groups: 5,
  },
  timemania: {
    id: 'timemania', totalNumbers: 80, minNumbers: 10,
    sumMin: 190, sumMax: 620, sumIdeal: 405,
    evenMin: 4, evenMax: 6, maxSeqLength: 3, groups: 8,
  },
  diadesorte: {
    id: 'diadesorte', totalNumbers: 31, minNumbers: 7,
    sumMin: 50, sumMax: 175, sumIdeal: 112,
    evenMin: 3, evenMax: 4, maxSeqLength: 3, groups: 4,
  },
  supersete: {
    id: 'supersete', totalNumbers: 10, minNumbers: 7,
    sumMin: 18, sumMax: 58, sumIdeal: 38,
    evenMin: 3, evenMax: 4, maxSeqLength: 3, groups: 2,
  },
};

export function getLotteryConfig(lotteryId: string, totalNumbers: number, minNumbers: number): LotteryConfig {
  const base = LOTTERY_CONFIGS[lotteryId];

  // Se a loteria é conhecida E o minNumbers bate com o padrão, usa config fixo
  if (base && base.minNumbers === minNumbers) return base;

  // minNumbers personalizado (usuário pediu mais dezenas) ou loteria desconhecida
  // Gera config dinâmica proporcional ao minNumbers real
  const density = minNumbers / totalNumbers;
  const maxSeqFactor = density > 0.70 ? 0.85 : density > 0.50 ? 0.70 : density > 0.30 ? 0.50 : 0.38;
  return {
    id: lotteryId,
    totalNumbers,
    minNumbers,
    sumMin:       Math.floor((totalNumbers + 1) * minNumbers / 2 * 0.6),
    sumMax:       Math.floor((totalNumbers + 1) * minNumbers / 2 * 1.4),
    sumIdeal:     Math.floor((totalNumbers + 1) * minNumbers / 2),
    evenMin:      Math.floor(minNumbers * 0.3),
    evenMax:      Math.ceil(minNumbers * 0.7),
    maxSeqLength: Math.ceil(minNumbers * maxSeqFactor),
    groups:       base?.groups ?? Math.min(10, Math.ceil(totalNumbers / 10)),
  };
}

// ============================================================
//  2. ANÁLISE POR JANELAS DE FREQUÊNCIA
//  w10=45%, w50=30%, w100=15%, full=10%
// ============================================================

export interface FrequencyWindows {
  w10:  Record<number, number>;
  w50:  Record<number, number>;
  w100: Record<number, number>;
  full: Record<number, number>;
  counts: { w10: number; w50: number; w100: number; full: number };
}

export function computeMultiWindow(draws: number[][], totalNumbers: number): FrequencyWindows {
  const w10:  Record<number, number> = {};
  const w50:  Record<number, number> = {};
  const w100: Record<number, number> = {};
  const full: Record<number, number> = {};

  for (let n = 1; n <= totalNumbers; n++) w10[n] = w50[n] = w100[n] = full[n] = 0;

  const slice10  = draws.slice(0, Math.min(10, draws.length));
  const slice50  = draws.slice(0, Math.min(50, draws.length));
  const slice100 = draws.slice(0, Math.min(100, draws.length));

  draws.forEach   (d => d.forEach(n => { if (full[n]  !== undefined) full[n]++;  }));
  slice100.forEach(d => d.forEach(n => { if (w100[n]  !== undefined) w100[n]++;  }));
  slice50.forEach (d => d.forEach(n => { if (w50[n]   !== undefined) w50[n]++;   }));
  slice10.forEach (d => d.forEach(n => { if (w10[n]   !== undefined) w10[n]++;   }));

  return {
    w10, w50, w100, full,
    counts: { w10: slice10.length, w50: slice50.length, w100: slice100.length, full: draws.length },
  };
}

// ============================================================
//  3. PESO COMPOSTO POR NÚMERO — janela ponderada calibrada
//  w10=45%, w50=30%, w100=15%, full=10%
// ============================================================

export function computeCompositeWeights(windows: FrequencyWindows, totalNumbers: number): Record<number, number> {
  const weights: Record<number, number> = {};
  const { w10, w50, w100, full, counts } = windows;
  const d10  = Math.max(counts.w10,  1);
  const d50  = Math.max(counts.w50,  1);
  const d100 = Math.max(counts.w100, 1);
  const dAll = Math.max(counts.full,  1);

  for (let n = 1; n <= totalNumbers; n++) {
    const r10  = w10[n]  / d10;
    const r50  = w50[n]  / d50;
    const r100 = w100[n] / d100;
    const rAll = full[n] / dAll;
    weights[n] = r10 * 0.45 + r50 * 0.30 + r100 * 0.15 + rAll * 0.10;
  }

  return weights;
}

// ============================================================
//  4. PESO DE ATRASO AJUSTADO (normalizado 0-1)
// ============================================================

export function computeAdjustedDelay(draws: number[][], totalNumbers: number): Record<number, number> {
  const freq: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) freq[n] = 0;
  draws.forEach(d => d.forEach(n => { if (freq[n] !== undefined) freq[n]++; }));

  const result: Record<number, number> = {};
  const total = draws.length;

  for (let n = 1; n <= totalNumbers; n++) {
    const lastIdx = draws.findIndex(d => d.includes(n));
    const delay   = lastIdx === -1 ? total : lastIdx;
    const avgCycle = total / Math.max(freq[n], 0.5);
    const ratio    = delay / Math.max(avgCycle, 1);
    result[n] = Math.min(ratio / 3, 1.0);
  }

  return result;
}

// ============================================================
//  5. SCORE DE MOMENTUM — tendência de curto prazo
//  Compara presença nos últimos 3 sorteios vs janela 4-10.
//  0 = caindo, 0.5 = estável, 1 = subindo (promissor).
// ============================================================

export function computeMomentum(draws: number[][], totalNumbers: number): Record<number, number> {
  const recent3:  Record<number, number> = {};
  const prev7:    Record<number, number> = {};

  for (let n = 1; n <= totalNumbers; n++) { recent3[n] = 0; prev7[n] = 0; }

  const slice3  = draws.slice(0, Math.min(3, draws.length));
  const slice47 = draws.slice(3, Math.min(10, draws.length));

  slice3.forEach (d => d.forEach(n => { if (recent3[n] !== undefined) recent3[n]++; }));
  slice47.forEach(d => d.forEach(n => { if (prev7[n]   !== undefined) prev7[n]++;   }));

  const r3Count = Math.max(slice3.length, 1);
  const p7Count = Math.max(slice47.length, 1);

  const momentum: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) {
    const rRate = recent3[n] / r3Count;
    const pRate = prev7[n]   / p7Count;
    // Normaliza diferença para 0-1 com 0.5 como neutro
    const raw   = 0.5 + (rRate - pRate) * 1.5;
    momentum[n] = Math.max(0, Math.min(1, raw));
  }
  return momentum;
}

// ============================================================
//  6. NOTA DE CONFIANÇA POR DEZENA (0-100)
// ============================================================

export function computeConfidence(
  weights: Record<number, number>,
  delays: Record<number, number>,
  totalNumbers: number,
): Record<number, number> {
  const raw: Record<number, number> = {};
  let max = 0;

  for (let n = 1; n <= totalNumbers; n++) {
    raw[n] = (weights[n] ?? 0) * 0.65 + (delays[n] ?? 0) * 0.35;
    if (raw[n] > max) max = raw[n];
  }

  const scale = max > 0 ? 1 / max : 1;
  const conf: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) conf[n] = Math.round(raw[n] * scale * 100);
  return conf;
}

// ============================================================
//  7. MATRIZ DE CO-OCORRÊNCIA (pares)
// ============================================================

export interface CoMatrix {
  pairs: Record<string, number>;
  maxCount: number;
  strength: (a: number, b: number) => number;
}

export function buildCoMatrix(draws: number[][]): CoMatrix {
  const pairs: Record<string, number> = {};

  draws.forEach(draw => {
    const s = [...draw].sort((a, b) => a - b);
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++) {
        const k = `${s[i]},${s[j]}`;
        pairs[k] = (pairs[k] ?? 0) + 1;
      }
  });

  const maxCount = Math.max(...Object.values(pairs), 1);

  const strength = (a: number, b: number): number => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    return (pairs[k] ?? 0) / maxCount;
  };

  return { pairs, maxCount, strength };
}

export function scorePairDiversity(jogo: number[], matrix: CoMatrix): number {
  let total = 0, count = 0;
  for (let i = 0; i < jogo.length; i++)
    for (let j = i + 1; j < jogo.length; j++) {
      total += matrix.strength(jogo[i], jogo[j]);
      count++;
    }
  if (count === 0) return 0.5;
  const avg = total / count;
  return 1 - Math.abs(avg - 0.5) * 2;
}

// ============================================================
//  8. ANÁLISE POR POSIÇÃO
// ============================================================

export function buildPositionWeights(
  draws: number[][],
  minNumbers: number,
  totalNumbers: number,
): Record<number, Record<number, number>> {
  const posFreq: Record<number, Record<number, number>> = {};
  for (let p = 0; p < minNumbers; p++) {
    posFreq[p] = {};
    for (let n = 1; n <= totalNumbers; n++) posFreq[p][n] = 0;
  }

  draws.forEach(draw => {
    const s = [...draw].sort((a, b) => a - b);
    s.slice(0, minNumbers).forEach((n, pos) => {
      if (posFreq[pos]?.[n] !== undefined) posFreq[pos][n]++;
    });
  });

  const total = Math.max(draws.length, 1);
  const norm: Record<number, Record<number, number>> = {};
  for (let p = 0; p < minNumbers; p++) {
    norm[p] = {};
    for (let n = 1; n <= totalNumbers; n++) norm[p][n] = (posFreq[p][n] ?? 0) / total;
  }

  return norm;
}

export function scorePositionFit(
  jogo: number[],
  posWeights: Record<number, Record<number, number>>,
): number {
  const s = [...jogo].sort((a, b) => a - b);
  let score = 0;
  const positions = Object.keys(posWeights).length;
  if (positions === 0) return 0.5;

  s.forEach((n, pos) => {
    score += (posWeights[pos]?.[n] ?? 0) * 10;
  });

  return Math.min(score / s.length, 1);
}

// ============================================================
//  9. ANÁLISE DE GAP (distância entre dezenas consecutivas)
// ============================================================

export interface GapProfile {
  avgGap: number;
  stdGap: number;
}

export function buildGapProfile(draws: number[][], minNumbers: number): GapProfile {
  const allGaps: number[] = [];

  draws.forEach(draw => {
    const s = [...draw].sort((a, b) => a - b).slice(0, minNumbers);
    for (let i = 1; i < s.length; i++) allGaps.push(s[i] - s[i - 1]);
  });

  if (allGaps.length === 0) return { avgGap: 0, stdGap: 1 };
  const avg = allGaps.reduce((a, b) => a + b, 0) / allGaps.length;
  const std = Math.sqrt(allGaps.reduce((a, g) => a + Math.pow(g - avg, 2), 0) / allGaps.length);
  return { avgGap: avg, stdGap: Math.max(std, 1) };
}

export function scoreGapFit(jogo: number[], profile: GapProfile): number {
  const s = [...jogo].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < s.length; i++) gaps.push(s[i] - s[i - 1]);
  if (gaps.length === 0) return 0.5;

  const avgDev = gaps.reduce((a, g) => a + Math.abs(g - profile.avgGap) / profile.stdGap, 0) / gaps.length;
  return Math.max(0, 1 - avgDev / 3);
}

// ============================================================
//  10. MAPA DO VOLANTE (equilíbrio por grupos/regiões)
// ============================================================

export function scoreVolanteBalance(jogo: number[], totalNumbers: number, groups: number): number {
  if (groups <= 0) return 0.5;
  const size = Math.ceil(totalNumbers / groups);
  const counts = Array<number>(groups).fill(0);
  jogo.forEach(n => {
    const g = Math.min(Math.floor((n - 1) / size), groups - 1);
    counts[g]++;
  });
  const ideal = jogo.length / groups;
  const dev = counts.reduce((a, c) => a + Math.abs(c - ideal), 0);
  return Math.max(0, 1 - dev / Math.max(jogo.length, 1));
}

// ============================================================
//  11. FAIXA DE SOMA HISTÓRICA
// ============================================================

export function scoreSumRange(jogo: number[], config: LotteryConfig): number {
  const sum = jogo.reduce((a, b) => a + b, 0);
  if (sum < config.sumMin || sum > config.sumMax) return 0;
  const half = (config.sumMax - config.sumMin) / 2;
  const dist = Math.abs(sum - config.sumIdeal);
  return Math.max(0, 1 - dist / Math.max(half, 1));
}

// ============================================================
//  12. ENTROPIA DE ESPAÇAMENTO
// ============================================================

export function scoreEntropy(jogo: number[]): number {
  const s = [...jogo].sort((a, b) => a - b);
  const n = s.length;
  if (n <= 1) return 0;

  const range = s[n - 1] - s[0];
  if (range === 0) return 0;

  const expected = range / (n - 1);
  const variance = s.slice(1).reduce((acc, v, i) => {
    const g = v - s[i];
    return acc + Math.pow(g - expected, 2);
  }, 0) / (n - 1);

  const std = Math.sqrt(variance);
  return Math.max(0, 1 - (std / Math.max(expected, 1)) / 2);
}

// ============================================================
//  13. DETECTOR DE PADRÕES HUMANOS
// ============================================================

export function scoreHumanPatternPenalty(jogo: number[]): number {
  const s = [...jogo].sort((a, b) => a - b);
  let penalty = 0;

  if (s.length > 2) {
    const diffs = s.slice(1).map((v, i) => v - s[i]);
    if (diffs.every(d => d === diffs[0])) penalty += 0.30;
  }

  if (s.every(n => n <= 12) && s.length >= 4) penalty += 0.20;
  if (s.every(n => n <= 31) && s.length >= 5) penalty += 0.10;

  for (const m of [2, 3, 5, 10]) {
    if (s.filter(n => n % m === 0).length >= Math.ceil(s.length * 0.7)) {
      penalty += 0.15;
      break;
    }
  }

  let maxRun = 1, run = 1;
  for (let i = 1; i < s.length; i++) {
    run = s[i] === s[i - 1] + 1 ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  if (maxRun >= Math.ceil(s.length * 0.6)) penalty += 0.25;

  return Math.max(0, 1 - penalty);
}

// ============================================================
//  14. PARIDADE (equilíbrio pares/ímpares por modalidade)
// ============================================================

export function scoreParity(jogo: number[], config: LotteryConfig): number {
  const evens = jogo.filter(n => n % 2 === 0).length;
  if (evens >= config.evenMin && evens <= config.evenMax) return 1;
  const overshoot = evens < config.evenMin
    ? config.evenMin - evens
    : evens - config.evenMax;
  return Math.max(0, 1 - overshoot / Math.max(jogo.length * 0.3, 1));
}

// ============================================================
//  15. SCORE MESTRE MULTI-DIMENSIONAL — v3.1
//  Pesos recalibrados para maior assertividade:
//  - Soma range e paridade aumentados (preditores mais confiáveis)
//  - Momentum adicionado (tendência de curto prazo)
//  - positionFit e humanPattern reduzidos
// ============================================================

export interface ScoreDimensions {
  frequency: number;
  delayAdjusted: number;
  sum: number;
  volante: number;
  entropy: number;
  parity: number;
  pairDiversity: number;
  gapFit: number;
  positionFit: number;
  humanPattern: number;
  momentum: number;
}

export type RiskLevel = 'baixo' | 'medio' | 'alto';

export interface MasterScoreResult {
  score: number;
  dimensions: ScoreDimensions;
  riskLevel: RiskLevel;
  confidence: Record<number, number>;
}

export function computeMasterScore(
  jogo: number[],
  config: LotteryConfig,
  compositeWeights: Record<number, number>,
  adjustedDelay: Record<number, number>,
  matrix: CoMatrix,
  posWeights: Record<number, Record<number, number>>,
  gapProfile: GapProfile,
  confidenceScores: Record<number, number>,
  momentumScores?: Record<number, number>,
): MasterScoreResult {
  const freqScore  = jogo.reduce((a, n) => a + (compositeWeights[n] ?? 0), 0) / jogo.length;
  const delayScore = jogo.reduce((a, n) => a + (adjustedDelay[n] ?? 0),   0) / jogo.length;
  const momScore   = momentumScores
    ? jogo.reduce((a, n) => a + (momentumScores[n] ?? 0.5), 0) / jogo.length
    : 0.5;

  const dims: ScoreDimensions = {
    frequency:     Math.min(freqScore * 6, 1),
    delayAdjusted: delayScore,
    sum:           scoreSumRange(jogo, config),
    volante:       scoreVolanteBalance(jogo, config.totalNumbers, config.groups),
    entropy:       scoreEntropy(jogo),
    parity:        scoreParity(jogo, config),
    pairDiversity: scorePairDiversity(jogo, matrix),
    gapFit:        scoreGapFit(jogo, gapProfile),
    positionFit:   scorePositionFit(jogo, posWeights),
    humanPattern:  scoreHumanPatternPenalty(jogo),
    momentum:      momScore,
  };

  // Pesos recalibrados v3.1
  const raw =
    dims.frequency     * 0.16 +
    dims.delayAdjusted * 0.11 +
    dims.sum           * 0.17 +   // ↑ mais relevante estatisticamente
    dims.volante       * 0.12 +
    dims.entropy       * 0.11 +
    dims.parity        * 0.14 +   // ↑ paridade é altamente preditiva
    dims.pairDiversity * 0.08 +
    dims.gapFit        * 0.06 +
    dims.positionFit   * 0.02 +
    dims.humanPattern  * 0.01 +
    dims.momentum      * 0.02;    // novo: tendência de curto prazo

  const score = Math.min(100, Math.round(raw * 100));

  const avg3 = (dims.frequency + dims.entropy + dims.pairDiversity) / 3;
  const riskLevel: RiskLevel = avg3 >= 0.60 ? 'baixo' : avg3 >= 0.40 ? 'medio' : 'alto';

  return { score, dimensions: dims, riskLevel, confidence: confidenceScores };
}

// ============================================================
//  16. CONTROLE DE DIVERSIDADE ENTRE JOGOS (Jaccard)
// ============================================================

export function jaccardDistance(a: number[], b: number[]): number {
  const setA = new Set(a);
  const inter = b.filter(n => setA.has(n)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? 1 - inter / union : 0;
}

export function filterByDiversity<T extends { jogo: number[] }>(
  candidates: T[],
  minDistance: number,
  maxGames: number,
): T[] {
  if (candidates.length === 0) return [];
  const selected: T[] = [candidates[0]];

  for (const c of candidates.slice(1)) {
    if (selected.length >= maxGames) break;
    const tooClose = selected.some(s => jaccardDistance(s.jogo, c.jogo) < minDistance);
    if (!tooClose) selected.push(c);
  }

  return selected;
}

// ============================================================
//  17. ALGORITMO EVOLUTIVO (Geração → Score → Mutação)
//  v3.1: 5 gerações, mutação adaptativa, elitismo reforçado
// ============================================================

export interface EvolvedCandidate {
  jogo: number[];
  masterScore: number;
  riskLevel: RiskLevel;
  origem: string;
}

export function evolvePopulation(
  initialCandidates: Array<{ jogo: number[]; origem: string }>,
  config: LotteryConfig,
  compositeWeights: Record<number, number>,
  adjustedDelay: Record<number, number>,
  matrix: CoMatrix,
  posWeights: Record<number, Record<number, number>>,
  gapProfile: GapProfile,
  confidenceScores: Record<number, number>,
  generations: number = 5,
  populationSize: number = 400,
  momentumScores?: Record<number, number>,
): EvolvedCandidate[] {
  const { totalNumbers, minNumbers } = config;
  const allNums = Array.from({ length: totalNumbers }, (_, i) => i + 1);

  const score = (jogo: number[]) =>
    computeMasterScore(jogo, config, compositeWeights, adjustedDelay, matrix, posWeights, gapProfile, confidenceScores, momentumScores);

  let population: EvolvedCandidate[] = initialCandidates.map(c => {
    const { score: s, riskLevel } = score(c.jogo);
    return { jogo: c.jogo, masterScore: s, riskLevel, origem: c.origem };
  });

  for (let gen = 0; gen < generations; gen++) {
    population.sort((a, b) => b.masterScore - a.masterScore);

    // Elitismo reforçado: top 35% sobrevivem diretamente
    const eliteSize = Math.max(2, Math.floor(populationSize * 0.35));
    const elites    = population.slice(0, eliteSize);
    const offspring: EvolvedCandidate[] = [...elites];

    let attempts = 0;
    while (offspring.length < populationSize && attempts < populationSize * 6) {
      attempts++;

      // Crossover: combina dois elites ponderado por confiança
      const p1 = elites[Math.floor(Math.random() * elites.length)].jogo;
      const p2 = elites[Math.floor(Math.random() * elites.length)].jogo;
      const union = [...new Set([...p1, ...p2])];

      // Seleciona usando compositeWeight + delay + momentum como peso
      const weightedUnion = union
        .map(n => ({
          n,
          w: (compositeWeights[n] ?? 0) * 0.55
           + (adjustedDelay[n] ?? 0) * 0.30
           + ((momentumScores?.[n] ?? 0.5) - 0.5) * 0.15,
        }))
        .sort((a, b) => b.w - a.w);

      let child = weightedUnion.slice(0, minNumbers).map(x => x.n);

      // Mutação adaptativa: taxa cresce em gerações mais avançadas para evitar estagnação
      const mutRate      = 0.3 + gen * 0.05;
      const numMutations = Math.random() < mutRate ? 2 : 1;

      for (let m = 0; m < numMutations; m++) {
        const removeIdx  = Math.floor(Math.random() * child.length);
        const childSet   = new Set(child);
        const available  = allNums.filter(n => !childSet.has(n));
        if (available.length === 0) continue;

        // Prefere números com maior peso combinado na mutação
        available.sort((a, b) =>
          ((compositeWeights[b] ?? 0) + (adjustedDelay[b] ?? 0) + ((momentumScores?.[b] ?? 0.5) - 0.5)) -
          ((compositeWeights[a] ?? 0) + (adjustedDelay[a] ?? 0) + ((momentumScores?.[a] ?? 0.5) - 0.5))
        );
        const pool   = available.slice(0, Math.ceil(available.length * 0.5));
        const picked = pool[Math.floor(Math.random() * pool.length)];
        child[removeIdx] = picked;
      }

      const deduped = [...new Set(child)].sort((a, b) => a - b);
      if (deduped.length !== minNumbers) continue;

      const { score: s, riskLevel } = score(deduped);
      offspring.push({ jogo: deduped, masterScore: s, riskLevel, origem: `gen${gen + 1}` });
    }

    population = offspring;
  }

  population.sort((a, b) => b.masterScore - a.masterScore);
  return population;
}

// ============================================================
//  18. MAXIMIZAÇÃO DE COBERTURA
// ============================================================

export function maximizeCoverage<T extends { jogo: number[] }>(
  candidates: T[],
  totalNumbers: number,
  targetGames: number,
): T[] {
  if (candidates.length === 0) return [];

  const selected: T[] = [];
  const covered = new Set<number>();

  const remaining = [...candidates];

  while (selected.length < targetGames && remaining.length > 0) {
    let bestIdx = 0;
    let bestNew = -1;

    for (let i = 0; i < remaining.length; i++) {
      const newNums = remaining[i].jogo.filter(n => !covered.has(n)).length;
      if (newNums > bestNew) { bestNew = newNums; bestIdx = i; }
    }

    const winner = remaining.splice(bestIdx, 1)[0];
    selected.push(winner);
    winner.jogo.forEach(n => covered.add(n));

    if (covered.size >= totalNumbers) break;
  }

  // Complementa com os de maior score se necessário
  for (const c of candidates) {
    if (selected.length >= targetGames) break;
    if (!selected.includes(c)) selected.push(c);
  }

  return selected;
}

// ============================================================
//  19. CONTEXTO ESTATÍSTICO COMPLETO
// ============================================================

export interface StatisticalContext {
  windows:          FrequencyWindows;
  compositeWeights: Record<number, number>;
  adjustedDelay:    Record<number, number>;
  momentum:         Record<number, number>;
  confidence:       Record<number, number>;
  matrix:           CoMatrix;
  posWeights:       Record<number, Record<number, number>>;
  gapProfile:       GapProfile;
  config:           LotteryConfig;
  totalNumbers:     number;
}

export function buildStatisticalContext(
  draws:        number[][],
  lotteryId:    string,
  totalNumbers: number,
  minNumbers:   number,
): StatisticalContext {
  const config          = getLotteryConfig(lotteryId, totalNumbers, minNumbers);
  const windows         = computeMultiWindow(draws, totalNumbers);
  const compositeWeights = computeCompositeWeights(windows, totalNumbers);
  const adjustedDelay   = computeAdjustedDelay(draws, totalNumbers);
  const momentum        = computeMomentum(draws, totalNumbers);
  const confidence      = computeConfidence(compositeWeights, adjustedDelay, totalNumbers);
  const matrix          = buildCoMatrix(draws);
  const posWeights      = buildPositionWeights(draws, minNumbers, totalNumbers);
  const gapProfile      = buildGapProfile(draws, minNumbers);

  return { windows, compositeWeights, adjustedDelay, momentum, confidence, matrix, posWeights, gapProfile, config, totalNumbers };
}

// ============================================================
//  20. NÚCLEO + VARIAÇÃO (helper para sharkEngine)
// ============================================================

export function buildNucleusVariation(
  nucleus: number[],
  variationPool: number[],
  minNumbers: number,
  nucleusFraction: number,
): number[] {
  const nucleusCount   = Math.round(minNumbers * nucleusFraction);
  const variationCount = minNumbers - nucleusCount;

  const shuffleArr = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const nPick = shuffleArr(nucleus).slice(0, nucleusCount);
  const vPick = shuffleArr(variationPool.filter(n => !nPick.includes(n))).slice(0, variationCount);
  const all   = [...new Set([...nPick, ...vPick])];

  while (all.length < minNumbers) {
    const extra = [...nucleus, ...variationPool].find(n => !all.includes(n));
    if (extra) all.push(extra); else break;
  }

  return all.sort((a, b) => a - b).slice(0, minNumbers);
}
