// ============================================================
//  Shark Ensemble Engine — Motor de geração avançado
//  Integra: grafo de coocorrência, mutação genética inteligente,
//  estratégias ensemble (Alpha/Balance/Hunter/Explorer),
//  filtro anti-padrões, cobertura, Monte Carlo, memória,
//  e score final normalizado 0–100.
//  NÃO substitui SharkEngine — adiciona camadas novas.
// ============================================================

import { runBacktest, type BacktestReport } from './backtestEngine';
import { computeAdaptivePesos, rankWithAdaptivePesos, type AdaptivePesos } from './adaptiveWeightEngine';

// ── Interfaces públicas ──────────────────────────────────────

export interface EnsembleCandidate {
  jogo:           number[];
  strategy:       string;
  frequencyScore: number;
  delayScore:     number;
  patternScore:   number;
  networkScore:   number;
  geneticScore:   number;
  simulationScore: number;
  penaltyScore:   number;
  finalScore:     number;  // 0–100 normalizado
}

export interface EnsembleOutput {
  candidates:      EnsembleCandidate[];
  best:            EnsembleCandidate;
  backtestReport:  BacktestReport;
  adaptivePesos:   AdaptivePesos;
  coverageInfo:    { coverage: number; overlap: number };
}

export interface StrategyMemoryEntry {
  strategy:    string;
  wins:        number;
  losses:      number;
  avgHits:     number;
  updatedAt:   number;
}

// ── Memória de desempenho (in-process) ──────────────────────
const _memory: Record<string, StrategyMemoryEntry> = {};

export function getStrategyMemory(): Record<string, StrategyMemoryEntry> {
  return { ..._memory };
}

export function updateStrategyMemory(strategy: string, hits: number, minNumbers: number): void {
  if (!_memory[strategy]) {
    _memory[strategy] = { strategy, wins: 0, losses: 0, avgHits: hits, updatedAt: Date.now() };
  } else {
    const e = _memory[strategy];
    const total = e.wins + e.losses + 1;
    e.avgHits = (e.avgHits * (total - 1) + hits) / total;
    if (hits >= Math.ceil(minNumbers * 0.4)) e.wins++;
    else e.losses++;
    e.updatedAt = Date.now();
  }
}

// ── Utilitários ──────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle([...arr]).slice(0, Math.min(n, arr.length));
}

function complete(partial: number[], total: number, min: number): number[] {
  const set = new Set(partial);
  if (set.size >= min) return [...set].sort((a, b) => a - b).slice(0, min);
  const pool = shuffle(Array.from({ length: total }, (_, i) => i + 1).filter(n => !set.has(n)));
  for (const n of pool) {
    set.add(n);
    if (set.size >= min) break;
  }
  return [...set].sort((a, b) => a - b).slice(0, min);
}

// ── Grafo de Coocorrência ─────────────────────────────────────
interface CoocGraph {
  strong: Record<number, number[]>;  // pares com alta freq conjunta
  weak:   Record<number, number[]>;
  score:  Record<number, number>;    // score agregado por número
}

function buildCoocGraph(draws: number[][], totalNumbers: number): CoocGraph {
  const pairFreq: Record<string, number> = {};
  const numFreq:  Record<number, number> = {};

  for (const draw of draws) {
    for (const n of draw) numFreq[n] = (numFreq[n] || 0) + 1;
    for (let i = 0; i < draw.length; i++) {
      for (let j = i + 1; j < draw.length; j++) {
        const key = `${Math.min(draw[i], draw[j])}_${Math.max(draw[i], draw[j])}`;
        pairFreq[key] = (pairFreq[key] || 0) + 1;
      }
    }
  }

  const maxPair = Math.max(...Object.values(pairFreq), 1);
  const strong: Record<number, number[]> = {};
  const weak:   Record<number, number[]> = {};

  for (let n = 1; n <= totalNumbers; n++) {
    strong[n] = [];
    weak[n]   = [];
  }

  for (const [key, freq] of Object.entries(pairFreq)) {
    const [a, b] = key.split('_').map(Number);
    if (freq >= maxPair * 0.6) {
      strong[a].push(b);
      strong[b].push(a);
    } else if (freq >= maxPair * 0.3) {
      weak[a].push(b);
      weak[b].push(a);
    }
  }

  // Score por número: combinação de conexões fortes + freq total
  const score: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) {
    score[n] = (strong[n].length * 2 + weak[n].length) * (numFreq[n] || 0);
  }

  return { strong, weak, score };
}

// ── Filtro Anti-Padrões (penalização de score) ────────────────
function computePenalty(jogo: number[], minNumbers: number, totalNumbers: number): number {
  let penalty = 0;
  const sorted = [...jogo].sort((a, b) => a - b);

  // Sequências longas
  let maxSeq = 1, seq = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) { seq++; maxSeq = Math.max(maxSeq, seq); }
    else seq = 1;
  }
  const density = minNumbers / totalNumbers;
  const seqLimit = density > 0.6 ? minNumbers * 0.7 : density > 0.4 ? minNumbers * 0.5 : minNumbers * 0.35;
  if (maxSeq > seqLimit) penalty += (maxSeq - seqLimit) * 4;

  // Excesso de finais iguais (ex: 01,11,21,31)
  const endings: Record<number, number> = {};
  for (const n of jogo) { const e = n % 10; endings[e] = (endings[e] || 0) + 1; }
  for (const cnt of Object.values(endings)) {
    if (cnt >= 3) penalty += (cnt - 2) * 6;
  }

  // Distribuição ruim (concentração em quadrante)
  const quadrant = 4;
  const range    = Math.ceil(totalNumbers / quadrant);
  const quadCnt  = new Array(quadrant).fill(0);
  for (const n of jogo) quadCnt[Math.min(quadrant - 1, Math.floor((n - 1) / range))]++;
  const maxQ = Math.max(...quadCnt);
  const minQ = Math.min(...quadCnt);
  if (maxQ - minQ > Math.ceil(minNumbers / 2)) penalty += (maxQ - minQ - Math.ceil(minNumbers / 2)) * 3;

  // Padrões visuais (diagonal, linha)
  const rows = Math.ceil(totalNumbers / 10);
  for (let r = 0; r < rows; r++) {
    const rowNums = jogo.filter(n => Math.floor((n - 1) / 10) === r);
    if (rowNums.length >= 4) penalty += (rowNums.length - 3) * 5;
  }

  return Math.max(0, penalty);
}

// ── Monte Carlo Score ─────────────────────────────────────────
function monteCarloScore(
  jogo: number[],
  draws: number[][],
  simulations: number = 200,
): number {
  if (draws.length === 0) return 0.5;
  let hitSum = 0;
  const sampleSize = Math.min(simulations, draws.length);
  const sample = shuffle([...draws]).slice(0, sampleSize);
  for (const draw of sample) {
    const drawSet = new Set(draw);
    hitSum += jogo.filter(n => drawSet.has(n)).length;
  }
  const avgHits = hitSum / sampleSize;
  const minN    = jogo.length;
  return Math.min(1, avgHits / (minN * 0.25));
}

// ── Estratégias Ensemble ──────────────────────────────────────
type StrategyDef = {
  name:   string;
  freqW:  number;  // peso frequência
  delayW: number;  // peso atraso
  netW:   number;  // peso grafo
};

const ENSEMBLE_STRATEGIES: StrategyDef[] = [
  { name: 'SharkAlpha',    freqW: 0.55, delayW: 0.20, netW: 0.25 },
  { name: 'SharkBalance',  freqW: 0.33, delayW: 0.33, netW: 0.34 },
  { name: 'SharkHunter',   freqW: 0.25, delayW: 0.55, netW: 0.20 },
  { name: 'SharkExplorer', freqW: 0.20, delayW: 0.30, netW: 0.50 },
];

function generateWithStrategy(
  strat: StrategyDef,
  rankedFreq:  number[],
  rankedDelay: number[],
  rankedNet:   number[],
  minNumbers:  number,
  totalNumbers: number,
): number[] {
  // Constrói pool ponderado combinando os 3 rankings
  const scoreMap: Record<number, number> = {};
  const n = totalNumbers;
  for (const [i, num] of rankedFreq.entries())  { scoreMap[num] = (scoreMap[num] || 0) + ((n - i) / n) * strat.freqW; }
  for (const [i, num] of rankedDelay.entries())  { scoreMap[num] = (scoreMap[num] || 0) + ((n - i) / n) * strat.delayW; }
  for (const [i, num] of rankedNet.entries())    { scoreMap[num] = (scoreMap[num] || 0) + ((n - i) / n) * strat.netW; }

  const ranked = Object.keys(scoreMap)
    .map(Number)
    .sort((a, b) => scoreMap[b] - scoreMap[a]);

  // Pega o top pool e seleciona com variação
  const poolSize = Math.max(minNumbers + Math.ceil(minNumbers * 0.5), 20);
  const pool     = ranked.slice(0, poolSize);
  return complete(pickN(pool, Math.ceil(minNumbers * 1.2)), totalNumbers, minNumbers);
}

// ── Mutação Genética Inteligente ──────────────────────────────
function intelligentMutate(
  jogo:        number[],
  freq:        Record<number, number>,
  delay:       Record<number, number>,
  totalNumbers: number,
): number[] {
  const mutated = [...jogo];
  const mutIdx  = Math.floor(Math.random() * mutated.length);

  // Escolhe o número a remover: preferir os de menor score
  const scored = mutated.map((n, i) => ({
    n, i,
    score: (freq[n] || 0) * 0.5 + (delay[n] || 0) * 0.5,
  })).sort((a, b) => a.score - b.score);
  const removeIdx = scored[Math.floor(Math.random() * Math.ceil(scored.length * 0.4))].i;
  const removed   = mutated[removeIdx];

  // Candidatos para substituição: maior score mas não no jogo
  const inGame = new Set(mutated);
  const candidates = Array.from({ length: totalNumbers }, (_, i) => i + 1)
    .filter(n => !inGame.has(n))
    .map(n => ({ n, score: (freq[n] || 0) * 0.5 + (delay[n] || 0) * 0.5 }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    const topK   = Math.min(10, candidates.length);
    mutated[removeIdx] = candidates[Math.floor(Math.random() * topK)].n;
  }

  return mutated.sort((a, b) => a - b);
}

// ── Coverage Engine ───────────────────────────────────────────
interface CoverageInfo {
  coverage: number;  // % dos números cobertos pelos jogos
  overlap:  number;  // % de overlap entre jogos (menor = melhor cobertura)
}

function computeCoverage(games: number[][], totalNumbers: number): CoverageInfo {
  const covered = new Set<number>();
  games.forEach(g => g.forEach(n => covered.add(n)));
  const coverage = covered.size / totalNumbers;

  let overlapSum = 0;
  let pairs = 0;
  for (let i = 0; i < games.length; i++) {
    for (let j = i + 1; j < games.length; j++) {
      const setI = new Set(games[i]);
      const common = games[j].filter(n => setI.has(n)).length;
      overlapSum += common / games[i].length;
      pairs++;
    }
  }
  const overlap = pairs > 0 ? overlapSum / pairs : 0;
  return { coverage, overlap };
}

// ── Score Final ───────────────────────────────────────────────
function buildFinalScore(c: Omit<EnsembleCandidate, 'finalScore'>): number {
  const raw =
    c.frequencyScore  * 25 +
    c.delayScore      * 20 +
    c.patternScore    * 15 +
    c.networkScore    * 15 +
    c.geneticScore    * 10 +
    c.simulationScore * 15 -
    c.penaltyScore;

  return Math.max(0, Math.min(100, raw));
}

// ── Função principal de geração ───────────────────────────────
export async function generateEnsemble(opts: {
  draws:        number[][];
  totalNumbers: number;
  minNumbers:   number;
  candidatesPerStrategy?: number;
}): Promise<EnsembleOutput> {
  const { draws, totalNumbers, minNumbers, candidatesPerStrategy = 3 } = opts;

  // 1. Backtest
  const backtestReport = runBacktest(draws, totalNumbers, minNumbers);

  // 2. Pesos adaptativos
  const adaptivePesos = computeAdaptivePesos(backtestReport);

  // 3. Grafo de coocorrência
  const graph = buildCoocGraph(draws, totalNumbers);

  // 4. Rankings base
  const freq:  Record<number, number> = {};
  const delay: Record<number, number> = {};
  const recent: Record<number, number> = {};
  const nums   = Array.from({ length: totalNumbers }, (_, i) => i + 1);

  for (const n of nums) { freq[n] = 0; delay[n] = 0; recent[n] = 0; }
  draws.forEach(d => d.forEach(n => { if (freq[n] !== undefined) freq[n]++; }));
  draws.slice(0, 10).forEach(d => d.forEach(n => { if (recent[n] !== undefined) recent[n]++; }));
  for (const n of nums) {
    const idx = draws.findIndex(d => d.includes(n));
    delay[n] = idx === -1 ? draws.length : idx;
  }

  const lastDraw    = draws[0] ?? [];
  const rankedFreq  = [...nums].sort((a, b) => (freq[b]        || 0) - (freq[a]        || 0));
  const rankedDelay = [...nums].sort((a, b) => (delay[b]       || 0) - (delay[a]       || 0));
  const rankedNet   = [...nums].sort((a, b) => (graph.score[b] || 0) - (graph.score[a] || 0));

  // 5. Rankear com pesos adaptativos
  const rankedAdaptive = rankWithAdaptivePesos(nums, {
    freq, delay, lastDraw, cooc: graph.score, totalNumbers,
  }, adaptivePesos);

  // 6. Gerar candidatos por estratégia ensemble
  const rawCandidates: Array<{ jogo: number[]; strategy: string }> = [];

  for (const strat of ENSEMBLE_STRATEGIES) {
    for (let g = 0; g < candidatesPerStrategy; g++) {
      const jogo = generateWithStrategy(strat, rankedFreq, rankedDelay, rankedNet, minNumbers, totalNumbers);
      rawCandidates.push({ jogo, strategy: strat.name });
    }
  }

  // 7. Adicionar candidato baseado em pesos adaptativos
  const adaptiveGame = complete(pickN(rankedAdaptive.slice(0, minNumbers + 5), minNumbers), totalNumbers, minNumbers);
  rawCandidates.push({ jogo: adaptiveGame, strategy: 'SharkAdaptive' });

  // 8. Aplicar mutação genética em top candidatos
  for (let i = 0; i < Math.min(4, rawCandidates.length); i++) {
    const mutated = intelligentMutate(rawCandidates[i].jogo, freq, delay, totalNumbers);
    rawCandidates.push({ jogo: mutated, strategy: `${rawCandidates[i].strategy}_Mutated` });
  }

  // 9. Calcular scores para cada candidato
  const maxFreqVal  = Math.max(...nums.map(n => freq[n] || 0), 1);
  const maxDelayVal = Math.max(...nums.map(n => delay[n] || 0), 1);
  const maxNetVal   = Math.max(...nums.map(n => graph.score[n] || 0), 1);

  const memoryWeights: Record<string, number> = {};
  for (const [strat, entry] of Object.entries(_memory)) {
    const total = entry.wins + entry.losses;
    memoryWeights[strat] = total > 0 ? entry.wins / total : 0.5;
  }

  const scored: EnsembleCandidate[] = rawCandidates.map(({ jogo, strategy }) => {
    const freqScore  = jogo.reduce((s, n) => s + (freq[n] || 0) / maxFreqVal, 0) / jogo.length;
    const dScore     = jogo.reduce((s, n) => s + (delay[n] || 0) / maxDelayVal, 0) / jogo.length;
    const netScore   = jogo.reduce((s, n) => s + (graph.score[n] || 0) / maxNetVal, 0) / jogo.length;

    // Pattern score: paridade + distribuição por quadrante
    const evens = jogo.filter(n => n % 2 === 0).length;
    const parScore = 1 - Math.abs(evens - jogo.length / 2) / (jogo.length / 2);
    const sorted = [...jogo].sort((a, b) => a - b);
    const range   = totalNumbers / 4;
    const quadCnt = new Array(4).fill(0);
    sorted.forEach(n => quadCnt[Math.min(3, Math.floor((n - 1) / range))]++);
    const quadBalance = 1 - (Math.max(...quadCnt) - Math.min(...quadCnt)) / Math.max(jogo.length, 1);
    const patternScore = (parScore * 0.5 + quadBalance * 0.5);

    const geneticScore = memoryWeights[strategy] ?? 0.5;
    const simScore     = monteCarloScore(jogo, draws);
    const penalty      = computePenalty(jogo, minNumbers, totalNumbers);

    const partial = {
      jogo, strategy,
      frequencyScore:  freqScore,
      delayScore:      dScore,
      patternScore:    patternScore,
      networkScore:    netScore,
      geneticScore:    geneticScore,
      simulationScore: simScore,
      penaltyScore:    penalty,
    };

    return { ...partial, finalScore: buildFinalScore(partial) };
  });

  // 10. Ordenar por finalScore
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // 11. Cobertura dos top jogos
  const topGames = scored.slice(0, 5).map(c => c.jogo);
  const coverageInfo = computeCoverage(topGames, totalNumbers);

  return {
    candidates:     scored,
    best:           scored[0],
    backtestReport,
    adaptivePesos,
    coverageInfo,
  };
}
