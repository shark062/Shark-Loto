// ============================================================
//  Motor de Análise Avançada — Advanced Engine v1.0
//  Técnicas implementadas (100% TypeScript, sem dependências externas):
//  1. Matriz de Co-ocorrência — correlação entre pares de números
//  2. Centralidade por Autovetor (Power Iteration / PCA-lite)
//     — identifica números que correlacionam com muitos outros
//  3. Decaimento Exponencial de Frequência
//     — sorteios recentes pesam mais (λ = 0.97)
//  4. Periodicidade / Intervalo de Retorno
//     — prevê quando um número tende a voltar a aparecer
//  5. Score Ensemble — combinação ponderada dos 4 sinais acima
//  6. Amostragem Softmax com variação de temperatura (diversidade)
//  7. Validação: unicidade, intervalo válido, diversidade entre jogos
//
//  Interface de saída: compatível 100% com MasterOutput do sharkEngine.
// ============================================================

import type { MasterOutput } from './sharkEngine';

// ── Utilitário: shuffle Fisher-Yates ─────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Índice pré-computado: drawPresence[n][i] = true se n apareceu no draw i ─
function buildPresenceIndex(draws: number[][], totalNumbers: number): boolean[][] {
  const idx: boolean[][] = Array.from({ length: totalNumbers + 1 }, () =>
    new Array(draws.length).fill(false),
  );
  draws.forEach((d, i) => d.forEach(n => {
    if (n >= 1 && n <= totalNumbers) idx[n][i] = true;
  }));
  return idx;
}

// ── 1. Matriz de Co-ocorrência ────────────────────────────────────────────────
// coMatrix[a][b] = quantidade de sorteios em que a e b apareceram juntos.
function buildCoMatrix(draws: number[][], totalNumbers: number): Float32Array[] {
  const mat: Float32Array[] = Array.from(
    { length: totalNumbers + 1 },
    () => new Float32Array(totalNumbers + 1),
  );
  for (const draw of draws) {
    for (let ai = 0; ai < draw.length; ai++) {
      for (let bi = ai + 1; bi < draw.length; bi++) {
        const a = draw[ai], b = draw[bi];
        if (a >= 1 && a <= totalNumbers && b >= 1 && b <= totalNumbers) {
          mat[a][b]++;
          mat[b][a]++;
        }
      }
    }
  }
  return mat;
}

// ── 2. Centralidade por Autovetor (Power Iteration) ──────────────────────────
// Aproxima o autovetor dominante da matriz de co-ocorrência.
// Números com alta correlação com muitos outros → centralidade alta.
function computeEigenvectorCentrality(
  mat: Float32Array[],
  totalNumbers: number,
  iterations: number = 25,
): Record<number, number> {
  let vec = new Float64Array(totalNumbers + 1).fill(1 / totalNumbers);

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Float64Array(totalNumbers + 1);
    for (let i = 1; i <= totalNumbers; i++) {
      for (let j = 1; j <= totalNumbers; j++) {
        next[i] += mat[i][j] * vec[j];
      }
    }
    // L2 normalização
    let norm = 0;
    for (let i = 1; i <= totalNumbers; i++) norm += next[i] * next[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 1; i <= totalNumbers; i++) vec[i] = next[i] / norm;
  }

  const maxVal = Math.max(...Array.from(vec).slice(1)) || 1;
  const result: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) result[n] = vec[n] / maxVal;
  return result;
}

// ── 3. Frequência com Decaimento Exponencial ──────────────────────────────────
// Sorteio mais recente (índice 0) tem peso 1.0, o anterior λ, depois λ², etc.
// λ=0.97 dá ao sorteio de 30 atrás apenas 40% do peso do mais recente.
function computeDecayFrequency(
  presence: boolean[][],
  totalNumbers: number,
  draws: number,
  lambda: number = 0.97,
): Record<number, number> {
  const freq: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) freq[n] = 0;

  for (let i = 0; i < draws; i++) {
    const weight = Math.pow(lambda, i);
    for (let n = 1; n <= totalNumbers; n++) {
      if (presence[n][i]) freq[n] += weight;
    }
  }

  const maxVal = Math.max(...Object.values(freq)) || 1;
  const result: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) result[n] = freq[n] / maxVal;
  return result;
}

// ── 4. Score de Periodicidade (Intervalo de Retorno) ─────────────────────────
// Para cada número calcula o intervalo médio de retorno histórico.
// Score alto quando o atraso atual está próximo (±σ) do intervalo esperado.
function computePeriodicityScore(
  presence: boolean[][],
  totalNumbers: number,
  drawCount: number,
): Record<number, number> {
  const result: Record<number, number> = {};

  for (let n = 1; n <= totalNumbers; n++) {
    const appearances: number[] = [];
    for (let i = 0; i < drawCount; i++) {
      if (presence[n][i]) appearances.push(i);
    }

    if (appearances.length === 0) {
      // Nunca visto no período — atraso muito alto → score máximo
      result[n] = 1.0;
      continue;
    }
    if (appearances.length === 1) {
      // Visto uma vez — atraso = posição
      result[n] = Math.min(appearances[0] / Math.max(drawCount * 0.5, 1), 1.0);
      continue;
    }

    // Intervalos entre aparições consecutivas
    const gaps: number[] = [];
    for (let i = 1; i < appearances.length; i++) {
      gaps.push(appearances[i] - appearances[i - 1]);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length;
    const stdGap = Math.sqrt(variance) || 1;

    // Atraso atual: quantos sorteios desde a última aparição
    const currentDelay = appearances[0]; // draws ordenadas da mais recente

    // Distância normalizada ao intervalo médio esperado
    const deviation = Math.abs(currentDelay - avgGap) / stdGap;
    // Score: gaussiana — pico quando currentDelay == avgGap
    result[n] = Math.exp(-0.5 * deviation * deviation);
  }

  return result;
}

// ── 5. Frequência Composta Multi-Janela ───────────────────────────────────────
// w10=45%, w30=30%, w100=15%, all=10%
function computeCompositeFrequency(
  presence: boolean[][],
  totalNumbers: number,
  drawCount: number,
): Record<number, number> {
  const w10  = Math.min(10,  drawCount);
  const w30  = Math.min(30,  drawCount);
  const w100 = Math.min(100, drawCount);

  const result: Record<number, number> = {};

  for (let n = 1; n <= totalNumbers; n++) {
    let c10 = 0, c30 = 0, c100 = 0, cAll = 0;
    for (let i = 0; i < drawCount; i++) {
      if (!presence[n][i]) continue;
      if (i < w10)  c10++;
      if (i < w30)  c30++;
      if (i < w100) c100++;
      cAll++;
    }
    const r10  = w10  > 0 ? c10  / w10  : 0;
    const r30  = w30  > 0 ? c30  / w30  : 0;
    const r100 = w100 > 0 ? c100 / w100 : 0;
    const rAll = drawCount > 0 ? cAll / drawCount : 0;
    result[n] = r10 * 0.45 + r30 * 0.30 + r100 * 0.15 + rAll * 0.10;
  }

  const maxVal = Math.max(...Object.values(result)) || 1;
  for (let n = 1; n <= totalNumbers; n++) result[n] /= maxVal;
  return result;
}

// ── 6. Softmax com temperatura ────────────────────────────────────────────────
function softmaxSample(
  scores: Record<number, number>,
  temperature: number,
): Record<number, number> {
  const t = Math.max(temperature, 0.01);
  let sum = 0;
  const exp: Record<number, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    exp[parseInt(k)] = Math.exp(v / t);
    sum += exp[parseInt(k)];
  }
  const probs: Record<number, number> = {};
  for (const k of Object.keys(scores)) {
    probs[parseInt(k)] = exp[parseInt(k)] / (sum || 1);
  }
  return probs;
}

// ── 7. Amostragem Ponderada sem Reposição ────────────────────────────────────
function weightedSampleWithoutReplacement(
  probs: Record<number, number>,
  n: number,
  totalNumbers: number,
): number[] {
  const remaining: number[] = Array.from({ length: totalNumbers }, (_, i) => i + 1);
  const probCopy = { ...probs };
  const selected: number[] = [];

  for (let i = 0; i < n && remaining.length > 0; i++) {
    let total = remaining.reduce((s, x) => s + (probCopy[x] || 0), 0);
    if (total <= 0) {
      // Fallback aleatório
      const idx = Math.floor(Math.random() * remaining.length);
      selected.push(remaining[idx]);
      remaining.splice(idx, 1);
      continue;
    }
    let rand = Math.random() * total;
    let picked = remaining[remaining.length - 1];
    for (const x of remaining) {
      rand -= probCopy[x] || 0;
      if (rand <= 0) { picked = x; break; }
    }
    selected.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }

  return selected.sort((a, b) => a - b);
}

// ── 8. Validação de Jogo ──────────────────────────────────────────────────────
function isValidGame(jogo: number[], totalNumbers: number, minNumbers: number): boolean {
  if (jogo.length !== minNumbers) return false;
  const s = new Set(jogo);
  if (s.size !== minNumbers) return false;
  return jogo.every(n => n >= 1 && n <= totalNumbers);
}

// ── 9. Score do Jogo (média dos scores dos números selecionados) ──────────────
function scoreGame(
  jogo: number[],
  composite: Record<number, number>,
  decay: Record<number, number>,
  periodicity: Record<number, number>,
  centrality: Record<number, number>,
): number {
  let s = 0;
  for (const n of jogo) {
    s += (composite[n]   || 0) * 30;
    s += (decay[n]       || 0) * 25;
    s += (periodicity[n] || 0) * 25;
    s += (centrality[n]  || 0) * 20;
  }
  return parseFloat((s / jogo.length).toFixed(2));
}

// ── Similaridade entre dois jogos (Jaccard) ───────────────────────────────────
function similarity(a: number[], b: number[]): number {
  const setA = new Set(a);
  const inter = b.filter(n => setA.has(n)).length;
  return inter / (a.length + b.length - inter);
}

// ── FUNÇÃO PRINCIPAL EXPORTADA ────────────────────────────────────────────────
export function gerarJogosAvancado(
  draws: number[][],
  qtd: number = 10,
  totalNumbers: number = 60,
  minNumbers: number = 6,
  _lotteryId: string = 'megasena',
): MasterOutput {
  // Fallback para dados insuficientes
  if (draws.length < 2) {
    const nums = Array.from({ length: totalNumbers }, (_, i) => i + 1);
    return {
      jogos: Array.from({ length: qtd }, () => ({
        jogo:   shuffle(nums).slice(0, minNumbers).sort((a, b) => a - b),
        score:  0,
        origem: 'aleatorio',
      })),
      contexto: {
        hot: [], warm: [], cold: [],
        totalCandidatos: 0, totalValidados: 0,
        estrategiasUsadas: ['avancado'],
      },
    };
  }

  const drawCount = draws.length;

  // ── Pré-computa índice de presença (evita .includes() em O(n) repetido) ──
  const presence = buildPresenceIndex(draws, totalNumbers);

  // ── Computa os 4 sinais ───────────────────────────────────────────────────
  const coMatrix   = buildCoMatrix(draws, totalNumbers);
  const centrality = computeEigenvectorCentrality(coMatrix, totalNumbers, 25);
  const decay      = computeDecayFrequency(presence, totalNumbers, drawCount);
  const periodicity= computePeriodicityScore(presence, totalNumbers, drawCount);
  const composite  = computeCompositeFrequency(presence, totalNumbers, drawCount);

  // ── Score ensemble por número ─────────────────────────────────────────────
  const ensemble: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) {
    ensemble[n] =
      (composite[n]   || 0) * 0.30 +
      (decay[n]       || 0) * 0.25 +
      (periodicity[n] || 0) * 0.25 +
      (centrality[n]  || 0) * 0.20;
  }

  // ── Geração de candidatos com variação de temperatura ────────────────────
  const candidatos: Array<{ jogo: number[]; score: number; origem: string }> = [];
  const seen = new Set<string>();
  const rounds = Math.max(qtd * 60, 600);
  const baseTemp = 0.30;

  for (let r = 0; r < rounds; r++) {
    // Varia temperatura levemente para diversidade natural
    const t = baseTemp * (0.7 + Math.random() * 0.6);
    const probs = softmaxSample(ensemble, t);
    const jogo  = weightedSampleWithoutReplacement(probs, minNumbers, totalNumbers);

    if (!isValidGame(jogo, totalNumbers, minNumbers)) continue;

    const key = jogo.join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    candidatos.push({
      jogo,
      score:  scoreGame(jogo, composite, decay, periodicity, centrality),
      origem: 'avancado',
    });
  }

  // Ordena por score decrescente
  candidatos.sort((a, b) => b.score - a.score);

  // ── Seleção com diversidade (Jaccard máx 65% de sobreposição) ────────────
  const selected: typeof candidatos = [];
  for (const c of candidatos) {
    if (selected.length >= qtd) break;
    const tooSimilar = selected.some(s => similarity(c.jogo, s.jogo) > 0.65);
    if (!tooSimilar) selected.push(c);
  }

  // Preenche restantes se não há jogos suficientemente diversos
  if (selected.length < qtd) {
    for (const c of candidatos) {
      if (selected.length >= qtd) break;
      if (!selected.some(s => s.jogo.join(',') === c.jogo.join(','))) {
        selected.push(c);
      }
    }
  }

  // ── Contexto: hot/warm/cold baseado nos 10 sorteios mais recentes ────────
  const recentCount: Record<number, number> = {};
  for (let n = 1; n <= totalNumbers; n++) recentCount[n] = 0;
  draws.slice(0, 10).forEach(d => d.forEach(n => {
    if (recentCount[n] !== undefined) recentCount[n]++;
  }));
  const sorted = Object.entries(recentCount).sort(([, a], [, b]) => b - a);
  const hotN  = Math.ceil(totalNumbers * 0.20);
  const coldN = Math.ceil(totalNumbers * 0.20);
  const hot   = sorted.slice(0, hotN).map(([n]) => parseInt(n));
  const cold  = sorted.slice(-coldN).map(([n]) => parseInt(n));
  const warm  = sorted.slice(hotN, sorted.length - coldN).map(([n]) => parseInt(n));

  return {
    jogos: selected.slice(0, qtd),
    contexto: {
      hot,
      warm,
      cold,
      totalCandidatos:   candidatos.length,
      totalValidados:    selected.length,
      estrategiasUsadas: ['correlacao', 'periodicidade', 'decaimento_exp', 'centralidade_pca', 'ensemble'],
    },
  };
}
