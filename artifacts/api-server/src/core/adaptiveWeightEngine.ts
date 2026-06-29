// ============================================================
//  Adaptive Weight Engine — Ajusta pesos automaticamente
//  com base nos resultados do backtest.
//  Pesos: frequência, atraso, repetição, coocorrência, distribuição
//  Nunca permite peso negativo.
// ============================================================

import type { BacktestReport } from './backtestEngine';

export interface AdaptivePesos {
  frequencia:    number;
  atraso:        number;
  repeticao:     number;
  coocorrencia:  number;
  distribuicao:  number;
}

const PESOS_BASE: AdaptivePesos = {
  frequencia:   0.35,
  atraso:       0.25,
  repeticao:    0.15,
  coocorrencia: 0.15,
  distribuicao: 0.10,
};

// Ajustes por estratégia vencedora (quanto alterar cada peso)
const STRATEGY_BIAS: Record<string, Partial<AdaptivePesos>> = {
  impulso:     { frequencia: +0.08, atraso: -0.04, repeticao: +0.04, coocorrencia: 0, distribuicao: 0 },
  compensacao: { frequencia: -0.05, atraso: +0.10, repeticao: -0.03, coocorrencia: 0, distribuicao: 0 },
  equilibrio:  { frequencia: 0,     atraso: 0,     repeticao: 0,     coocorrencia: +0.05, distribuicao: +0.05 },
  quente_puro: { frequencia: +0.12, atraso: -0.06, repeticao: 0,     coocorrencia: +0.02, distribuicao: 0 },
  frio_puro:   { frequencia: -0.08, atraso: +0.15, repeticao: 0,     coocorrencia: 0,     distribuicao: +0.03 },
};

function clamp(v: number, min = 0.02, max = 0.80): number {
  return Math.max(min, Math.min(max, v));
}

function normalize(p: AdaptivePesos): AdaptivePesos {
  const total = Object.values(p).reduce((a, b) => a + b, 0);
  if (total === 0) return { ...PESOS_BASE };
  return {
    frequencia:   p.frequencia   / total,
    atraso:       p.atraso       / total,
    repeticao:    p.repeticao    / total,
    coocorrencia: p.coocorrencia / total,
    distribuicao: p.distribuicao / total,
  };
}

/**
 * Calcula pesos adaptativos com base no backtest.
 * Mescla PESOS_BASE com o bias da estratégia vencedora,
 * ponderado pela confiança do backtest.
 */
export function computeAdaptivePesos(report: BacktestReport): AdaptivePesos {
  const best  = report.bestStrategy;
  const bias  = STRATEGY_BIAS[best] ?? {};
  const topResult = report.results.find(r => r.strategy === best);
  const weight = topResult ? topResult.confidence : 0.5;

  const adjusted: AdaptivePesos = {
    frequencia:   clamp(PESOS_BASE.frequencia   + (bias.frequencia   ?? 0) * weight),
    atraso:       clamp(PESOS_BASE.atraso       + (bias.atraso       ?? 0) * weight),
    repeticao:    clamp(PESOS_BASE.repeticao    + (bias.repeticao    ?? 0) * weight),
    coocorrencia: clamp(PESOS_BASE.coocorrencia + (bias.coocorrencia ?? 0) * weight),
    distribuicao: clamp(PESOS_BASE.distribuicao + (bias.distribuicao ?? 0) * weight),
  };

  return normalize(adjusted);
}

/**
 * Aplica pesos adaptativos para ranquear números candidatos.
 * Retorna os números em ordem de peso decrescente.
 */
export function rankWithAdaptivePesos(
  nums: number[],
  opts: {
    freq:    Record<number, number>;
    delay:   Record<number, number>;
    lastDraw: number[];
    cooc:    Record<number, number>;  // score de coocorrência por número
    totalNumbers: number;
  },
  pesos: AdaptivePesos,
): number[] {
  const { freq, delay, lastDraw, cooc, totalNumbers } = opts;

  const maxFreq  = Math.max(...nums.map(n => freq[n]  || 0), 1);
  const maxDelay = Math.max(...nums.map(n => delay[n] || 0), 1);
  const maxCooc  = Math.max(...nums.map(n => cooc[n]  || 0), 1);

  const scored = nums.map(n => {
    const freqScore  = (freq[n]  || 0) / maxFreq;
    const delayScore = (delay[n] || 0) / maxDelay;
    const repScore   = lastDraw.includes(n) ? 1 : 0;
    const coocScore  = (cooc[n]  || 0) / maxCooc;
    // distribuicao: penaliza extremos (1 e totalNumbers), favorece meio
    const pos        = (n - 1) / (totalNumbers - 1);
    const distScore  = 1 - Math.abs(pos - 0.5) * 2;

    const total =
      freqScore  * pesos.frequencia   +
      delayScore * pesos.atraso       +
      repScore   * pesos.repeticao    +
      coocScore  * pesos.coocorrencia +
      distScore  * pesos.distribuicao;

    return { n, score: total };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.n);
}
