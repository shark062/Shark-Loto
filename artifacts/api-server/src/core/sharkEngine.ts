// ============================================================
//  Shark Engine v3.1 — Motor Master com Momentum + Genética Aprimorada
//  Integra: análise multi-janela, evolução genética adaptativa,
//  score multi-dimensional (11 dimensões), diversidade, cobertura.
//  Backward-compatible: todas as exportações anteriores mantidas.
// ============================================================

import {
  buildStatisticalContext,
  evolvePopulation,
  computeMasterScore,
  filterByDiversity,
  maximizeCoverage,
  buildNucleusVariation,
  getLotteryConfig,
  type StatisticalContext,
  type RiskLevel,
} from './statisticalEngine';

// ============================================================
//  Interfaces públicas (idênticas à v2 — 100% compatíveis)
// ============================================================

export interface SharkPesos {
  frequencia: number;
  atraso:     number;
  repeticao:  number;
}

const PESOS_PADRAO: SharkPesos = {
  frequencia: 0.50,
  atraso:     0.30,
  repeticao:  0.20,
};

export interface SharkContext {
  frequency:       Record<number, number>;
  recentFrequency: Record<number, number>;
  delay:           Record<number, number>;
  lastDraw:        number[];
  hot:             number[];
  warm:            number[];
  cold:            number[];
  totalNumbers:    number;
  minNumbers:      number;
}

export interface SharkResult {
  jogo:       number[];
  score:      number;
  origem:     string;
  riskLevel?: RiskLevel;
}

export interface MasterOutput {
  jogos: SharkResult[];
  contexto: {
    hot:               number[];
    warm:              number[];
    cold:              number[];
    totalCandidatos:   number;
    totalValidados:    number;
    estrategiasUsadas: string[];
    confidence?:       Record<number, number>;
    scoreDetalhado?:   string;
  };
}

export interface DesdobramentoOutput {
  combinacoes: number[][];
  total:       number;
  poolUsado:   number[];
}

// ============================================================
//  Utilitários internos
// ============================================================

function pick(arr: number[], n: number): number[] {
  return shuffle([...arr]).slice(0, Math.min(n, arr.length));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dedup(jogo: number[]): number[] {
  return [...new Set(jogo)];
}

// Garante exatamente minNumbers dezenas — preenche com números restantes se faltar
function completar(jogo: number[], totalNumbers: number, minNumbers: number): number[] {
  const set = new Set(jogo);
  if (set.size >= minNumbers) return [...set].sort((a, b) => a - b).slice(0, minNumbers);
  const resto = shuffle(
    Array.from({ length: totalNumbers }, (_, i) => i + 1).filter(n => !set.has(n))
  );
  for (const n of resto) {
    set.add(n);
    if (set.size >= minNumbers) break;
  }
  return [...set].sort((a, b) => a - b).slice(0, minNumbers);
}

// ============================================================
//  Contexto básico quente/fria/morna (compatibilidade v2)
// ============================================================

function buildContextCompleto(
  draws: number[][],
  totalNumbers: number,
  minNumbers: number,
): SharkContext {
  const frequency: Record<number, number>       = {};
  const recentFrequency: Record<number, number> = {};
  const delay: Record<number, number>           = {};
  const lastDraw = draws[0] || [];

  draws.forEach(draw => {
    draw.forEach(n => { frequency[n] = (frequency[n] || 0) + 1; });
  });

  const recentDraws = draws.slice(0, Math.min(10, draws.length));
  recentDraws.forEach(draw => {
    draw.forEach(n => { recentFrequency[n] = (recentFrequency[n] || 0) + 1; });
  });

  for (let n = 1; n <= totalNumbers; n++) {
    const idx = draws.findIndex(d => d.includes(n));
    delay[n] = idx === -1 ? draws.length : idx;
  }

  const numeros = Array.from({ length: totalNumbers }, (_, i) => i + 1);

  const sortedByRecent = [...numeros].sort(
    (a, b) => (recentFrequency[b] || 0) - (recentFrequency[a] || 0),
  );
  const sortedByDelay = [...numeros].sort(
    (a, b) => (delay[b] || 0) - (delay[a] || 0),
  );

  const hotCut  = Math.floor(totalNumbers * 0.33);
  const coldCut = Math.floor(totalNumbers * 0.33);

  const hotSet  = new Set(sortedByRecent.slice(0, hotCut));
  const coldSet = new Set(sortedByDelay.slice(0, coldCut));

  const hot: number[] = [], cold: number[] = [], warm: number[] = [];

  for (const n of numeros) {
    const isHot  = hotSet.has(n);
    const isCold = coldSet.has(n);
    if (isHot && !isCold)       hot.push(n);
    else if (isCold && !isHot)  cold.push(n);
    else if (isHot && isCold)   ((recentFrequency[n] || 0) >= 2 ? hot : cold).push(n);
    else                        warm.push(n);
  }

  return { frequency, recentFrequency, delay, lastDraw, hot, warm, cold, totalNumbers, minNumbers };
}

// ============================================================
//  Validação por modalidade (density-aware)
// ============================================================

function validarJogo(jogo: number[], totalNumbers: number, minNumbers: number): boolean {
  if (jogo.length !== minNumbers)             return false;
  if (new Set(jogo).size !== jogo.length)     return false;
  if (jogo.some(n => n < 1 || n > totalNumbers)) return false;

  const density = minNumbers / totalNumbers;

  // Para loterias muito densas (ex: 20/25 = 0.80), verificação de paridade é mais flexível
  const parFactor = density > 0.60 ? 0.08 : density > 0.45 ? 0.12 : 0.25;
  const minPares  = Math.floor(minNumbers * parFactor);
  const maxPares  = minNumbers - minPares;
  const pares     = jogo.filter(n => n % 2 === 0).length;
  if (pares < minPares || pares > maxPares) return false;

  const sorted = [...jogo].sort((a, b) => a - b);
  let maxSeq = 0, seq = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) { seq++; maxSeq = Math.max(maxSeq, seq); }
    else seq = 1;
  }

  // Para loterias muito densas, sequências longas são naturais e não devem ser penalizadas
  const seqFactor = density > 0.70 ? 0.90 : density > 0.50 ? 0.75 : density > 0.30 ? 0.50 : 0.38;
  if (maxSeq > Math.ceil(minNumbers * seqFactor)) return false;

  return true;
}

// ============================================================
//  Score legado (mantido para compatibilidade interna)
// ============================================================

function scoreCompleto(jogo: number[], ctx: SharkContext, pesos: SharkPesos = PESOS_PADRAO): number {
  let score = 0;

  jogo.forEach(n => {
    score += (ctx.recentFrequency[n] || 0) * pesos.frequencia * 15;
    score += (ctx.delay[n]            || 0) * pesos.atraso     * 8;
  });

  const temQuente = jogo.some(n => ctx.hot.includes(n));
  const temFria   = jogo.some(n => ctx.cold.includes(n));
  if (temQuente && temFria) score += 40;

  const propQ = jogo.filter(n => ctx.hot.includes(n)).length  / ctx.minNumbers;
  const propF = jogo.filter(n => ctx.cold.includes(n)).length / ctx.minNumbers;
  if (propQ >= 0.30 && propQ <= 0.55) score += 25;
  if (propF >= 0.20 && propF <= 0.45) score += 25;

  const pares     = jogo.filter(n => n % 2 === 0).length;
  const idealPares = ctx.minNumbers / 2;
  if (Math.abs(pares - idealPares) <= 1) score += 20;

  const repetidos = jogo.filter(n => ctx.lastDraw.includes(n)).length;
  const repIdeal  = ctx.minNumbers * pesos.repeticao * 2;
  score += Math.max(0, 30 - Math.abs(repetidos - repIdeal) * 4) * (pesos.repeticao * 3);

  return Math.round(score);
}

// ============================================================
//  Estratégias clássicas
// ============================================================

function gerarImpulso(ctx: SharkContext): number[] {
  const { hot, cold, warm, minNumbers, totalNumbers } = ctx;
  const hotQ  = Math.ceil(minNumbers * 0.50);
  const coldQ = Math.ceil(minNumbers * 0.25);
  const base = dedup([...pick(hot, hotQ), ...pick(cold, coldQ), ...pick(warm, minNumbers - hotQ - coldQ)]);
  return completar(base, totalNumbers, minNumbers);
}

function gerarCompensacao(ctx: SharkContext): number[] {
  const { hot, cold, warm, minNumbers, totalNumbers } = ctx;
  const coldQ = Math.ceil(minNumbers * 0.50);
  const hotQ  = Math.ceil(minNumbers * 0.25);
  const base = dedup([...pick(cold, coldQ), ...pick(hot, hotQ), ...pick(warm, minNumbers - coldQ - hotQ)]);
  return completar(base, totalNumbers, minNumbers);
}

function gerarVariacaoPura(ctx: SharkContext): number[] {
  const { hot, cold, warm, minNumbers, totalNumbers } = ctx;
  const terco = Math.floor(minNumbers / 3);
  const base = dedup([...pick(hot, terco), ...pick(cold, terco), ...pick(warm, minNumbers - terco * 2)]);
  return completar(base, totalNumbers, minNumbers);
}

function gerarPorPeso(ctx: SharkContext, pesos: SharkPesos = PESOS_PADRAO): number[] {
  const { recentFrequency, delay, totalNumbers, minNumbers } = ctx;
  const nums = Array.from({ length: totalNumbers }, (_, i) => i + 1);
  const ranked = nums
    .map(n => ({ n, peso: (recentFrequency[n] || 0) * pesos.frequencia * 15 + (delay[n] || 0) * pesos.atraso * 8 }))
    .sort((a, b) => b.peso - a.peso);
  // Expande pool para garantir cobertura suficiente quando minNumbers é grande
  const poolFrac = Math.max(0.5, minNumbers / totalNumbers + 0.2);
  const base = pick(ranked.slice(0, Math.floor(totalNumbers * poolFrac)).map(p => p.n), minNumbers);
  return completar(base, totalNumbers, minNumbers);
}

function gerarRepInteligente(ctx: SharkContext): number[] {
  const { lastDraw, cold, totalNumbers, minNumbers } = ctx;
  const repQ     = Math.ceil(minNumbers * 0.50);
  const friaQ    = Math.ceil(minNumbers * 0.25);
  const repetidos = lastDraw.length >= repQ ? pick(lastDraw, repQ) : [...lastDraw];
  const frias     = cold.filter(n => !repetidos.includes(n));
  const friasEsc  = pick(frias, friaQ);
  const todos     = Array.from({ length: totalNumbers }, (_, i) => i + 1);
  const novos     = pick(todos.filter(n => !repetidos.includes(n) && !friasEsc.includes(n)), minNumbers - repetidos.length - friasEsc.length);
  const base = dedup([...repetidos, ...friasEsc, ...novos]);
  return completar(base, totalNumbers, minNumbers);
}

function gerarRepBaixa(ctx: SharkContext): number[] {
  const { lastDraw, hot, cold, totalNumbers, minNumbers } = ctx;
  const repQ      = Math.ceil(minNumbers * 0.20);
  const hotQ      = Math.ceil(minNumbers * 0.40);
  const coldQ     = Math.ceil(minNumbers * 0.25);
  const repetidos = lastDraw.length >= repQ ? pick(lastDraw, repQ) : [...lastDraw];
  const quentes   = hot.filter(n => !repetidos.includes(n));
  const frias     = cold.filter(n => !repetidos.includes(n));
  const qEsc      = pick(quentes, hotQ);
  const fEsc      = pick(frias,   coldQ);
  const todos     = Array.from({ length: totalNumbers }, (_, i) => i + 1);
  const novos     = pick(todos.filter(n => !repetidos.includes(n) && !qEsc.includes(n) && !fEsc.includes(n)), minNumbers - repetidos.length - qEsc.length - fEsc.length);
  const base = dedup([...repetidos, ...qEsc, ...fEsc, ...novos]);
  return completar(base, totalNumbers, minNumbers);
}

// ============================================================
//  Estratégia MOMENTUM — números com tendência ascendente
//  Seleciona números que apareceram nos últimos 3 sorteios
//  combinados com os de maior atraso ajustado (momentum puro)
// ============================================================

function gerarMomentum(ctx: SharkContext, statCtx: StatisticalContext): number[] {
  const { totalNumbers, minNumbers } = ctx;
  const { momentum, adjustedDelay } = statCtx;

  const nums = Array.from({ length: totalNumbers }, (_, i) => i + 1);
  // Score: 60% momentum + 40% atraso ajustado para equilibrar tendência e "dívida"
  const ranked = nums
    .map(n => ({ n, w: (momentum[n] ?? 0.5) * 0.60 + (adjustedDelay[n] ?? 0) * 0.40 }))
    .sort((a, b) => b.w - a.w);

  // Pega o top 60% por momentum e faz seleção aleatória ponderada
  const pool   = ranked.slice(0, Math.ceil(totalNumbers * 0.60)).map(x => x.n);
  const result = pick(pool, minNumbers);
  // Se faltar, completa com o restante
  if (result.length < minNumbers) {
    const extra = nums.filter(n => !result.includes(n));
    result.push(...pick(extra, minNumbers - result.length));
  }
  return dedup(result).slice(0, minNumbers).sort((a, b) => a - b);
}

// ============================================================
//  Estratégia NÚCLEO + VARIAÇÃO (motor estatístico)
// ============================================================

function gerarNucleoVariacao(ctx: SharkContext, statCtx: StatisticalContext): number[] {
  const { minNumbers, totalNumbers } = ctx;
  const { compositeWeights, adjustedDelay, config } = statCtx;

  const nums = Array.from({ length: totalNumbers }, (_, i) => i + 1);

  const ranked = nums
    .map(n => ({ n, w: (compositeWeights[n] ?? 0) * 0.65 + (adjustedDelay[n] ?? 0) * 0.35 }))
    .sort((a, b) => b.w - a.w);

  const nucleusSize    = Math.ceil(minNumbers * 0.70);
  const nucleus        = ranked.slice(0, nucleusSize * 2).map(x => x.n);
  const variationPool  = ranked.slice(nucleusSize * 2).map(x => x.n);

  return buildNucleusVariation(nucleus, variationPool, minNumbers, 0.70);
}

// ============================================================
//  Estratégia por janela de frequência ponderada
// ============================================================

function gerarPorJanela(statCtx: StatisticalContext, minNumbers: number): number[] {
  const { compositeWeights, totalNumbers } = statCtx;
  const nums = Array.from({ length: totalNumbers }, (_, i) => i + 1);

  const weights = nums.map(n => Math.max(compositeWeights[n] ?? 0, 0.001));
  const totalW  = weights.reduce((a, b) => a + b, 0);
  const selected = new Set<number>();

  let attempts = 0;
  while (selected.size < minNumbers && attempts < minNumbers * 20) {
    attempts++;
    let r = Math.random() * totalW;
    for (let i = 0; i < nums.length; i++) {
      r -= weights[i];
      if (r <= 0 && !selected.has(nums[i])) { selected.add(nums[i]); break; }
    }
  }

  if (selected.size < minNumbers) {
    for (const n of shuffle(nums)) {
      if (selected.size >= minNumbers) break;
      selected.add(n);
    }
  }

  return [...selected].sort((a, b) => a - b).slice(0, minNumbers);
}

// ============================================================
//  Estratégia ANTI-CLUSTER — distribui uniformemente no volante
//  Garante que nenhuma região do volante fique sem representação
// ============================================================

function gerarAntiCluster(ctx: SharkContext, statCtx: StatisticalContext): number[] {
  const { minNumbers, totalNumbers } = ctx;
  const { compositeWeights, momentum, config } = statCtx;
  const groups = config.groups;
  const size   = Math.ceil(totalNumbers / groups);

  // Distribui dezenas por grupo, privilegiando peso composto + momentum
  const perGroup = Math.ceil(minNumbers / groups);
  const result: number[] = [];

  for (let g = 0; g < groups; g++) {
    const start = g * size + 1;
    const end   = Math.min((g + 1) * size, totalNumbers);
    const groupNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const ranked = groupNums
      .map(n => ({ n, w: (compositeWeights[n] ?? 0) * 0.70 + (momentum[n] ?? 0.5) * 0.30 }))
      .sort((a, b) => b.w - a.w);
    const take = Math.min(perGroup, ranked.length);
    result.push(...ranked.slice(0, take).map(x => x.n));
  }

  // Ajusta para exatamente minNumbers
  const deduped = dedup(result);
  if (deduped.length > minNumbers) return deduped.slice(0, minNumbers).sort((a, b) => a - b);
  if (deduped.length < minNumbers) {
    const all = Array.from({ length: totalNumbers }, (_, i) => i + 1).filter(n => !deduped.includes(n));
    deduped.push(...pick(all, minNumbers - deduped.length));
  }
  return dedup(deduped).slice(0, minNumbers).sort((a, b) => a - b);
}

const ESTRATEGIAS_BASE = [
  { nome: 'impulso',       fn: (ctx: SharkContext) => gerarImpulso(ctx) },
  { nome: 'compensacao',   fn: (ctx: SharkContext) => gerarCompensacao(ctx) },
  { nome: 'rep_alta',      fn: (ctx: SharkContext) => gerarRepInteligente(ctx) },
];

// ============================================================
//  Geração multi-estratégia com pool estatístico
// ============================================================

function gerarCandidatos(
  ctx: SharkContext,
  statCtx: StatisticalContext,
  rodadas: number,
  pesos: SharkPesos,
): Array<{ jogo: number[]; origem: string }> {
  const candidatos: Array<{ jogo: number[]; origem: string }> = [];

  for (let i = 0; i < rodadas; i++) {
    for (const { nome, fn } of ESTRATEGIAS_BASE) {
      candidatos.push({ jogo: fn(ctx).sort((a, b) => a - b), origem: nome });
    }
    candidatos.push({ jogo: gerarPorPeso(ctx, pesos).sort((a, b) => a - b), origem: 'peso_dinamico' });
  }

  return candidatos;
}

// ============================================================
//  Desdobramento por pool quente+fria
// ============================================================

function combinacoes(arr: number[], k: number, limite: number): number[][] {
  const result: number[][] = [];
  function bt(start: number, curr: number[]) {
    if (result.length >= limite) return;
    if (curr.length === k) { result.push([...curr]); return; }
    for (let i = start; i < arr.length; i++) {
      if (result.length >= limite) break;
      curr.push(arr[i]);
      bt(i + 1, curr);
      curr.pop();
    }
  }
  bt(0, []);
  return result;
}

function buildPoolQuenteFria(ctx: SharkContext, qtdJogos: number): number[] {
  const poolSize = Math.min(
    ctx.totalNumbers,
    Math.max(Math.ceil(ctx.minNumbers * 2.5), Math.ceil(qtdJogos * ctx.minNumbers * 0.4)),
  );
  const metade = Math.floor(poolSize / 2);
  const qOrdenados = [...ctx.hot].sort((a, b) => (ctx.recentFrequency[b] || 0) - (ctx.recentFrequency[a] || 0));
  const fOrdenadas = [...ctx.cold].sort((a, b) => (ctx.delay[b] || 0) - (ctx.delay[a] || 0));
  const pool = dedup([...qOrdenados.slice(0, metade), ...fOrdenadas.slice(0, metade)]);
  if (pool.length < ctx.minNumbers + 2) {
    pool.push(...ctx.warm.filter(n => !pool.includes(n)).slice(0, ctx.minNumbers + 2 - pool.length));
  }
  return pool.sort((a, b) => a - b);
}

// ============================================================
//  FUNÇÃO MASTER — integra v2 + motor estatístico v3.1
// ============================================================

export function gerarJogosMaster(
  draws:        number[][],
  qtd:          number       = 10,
  totalNumbers: number       = 60,
  minNumbers:   number       = 6,
  pesos?:       SharkPesos,
  lotteryId?:   string,
): MasterOutput {
  const pesosAtivos: SharkPesos = pesos
    ? { frequencia: pesos.frequencia, atraso: pesos.atraso, repeticao: pesos.repeticao }
    : { ...PESOS_PADRAO };

  if (draws.length < 2) {
    const nums = Array.from({ length: totalNumbers }, (_, i) => i + 1);
    return {
      jogos: Array.from({ length: qtd }, () => ({
        jogo:   shuffle(nums).slice(0, minNumbers).sort((a, b) => a - b),
        score:  0,
        origem: 'aleatorio',
      })),
      contexto: { hot: [], warm: [], cold: [], totalCandidatos: 0, totalValidados: 0, estrategiasUsadas: [] },
    };
  }

  // ── Contexto básico (v2) ──────────────────────────────────
  const ctx = buildContextCompleto(draws, totalNumbers, minNumbers);

  // ── Contexto estatístico avançado (v3.1) ─────────────────
  const resolvedId = lotteryId ?? 'megasena';
  const statCtx    = buildStatisticalContext(draws, resolvedId, totalNumbers, minNumbers);

  // ── PASSO 1: Geração multi-estratégia ────────────────────
  //    v3.1: mais rodadas + 2 novas estratégias (momentum, anti_cluster)
  const rodadas    = Math.max(40, qtd * 8);
  const candidatos = gerarCandidatos(ctx, statCtx, rodadas, pesosAtivos);

  // ── PASSO 2: Deduplicação + validação ────────────────────
  const vistos   = new Set<string>();
  const validados: Array<{ jogo: number[]; origem: string }> = [];

  for (const c of candidatos) {
    const key = c.jogo.join(',');
    if (vistos.has(key)) continue;
    if (!validarJogo(c.jogo, totalNumbers, minNumbers)) continue;
    vistos.add(key);
    validados.push(c);
  }

  // ── PASSO 3: Desdobramento quente+fria ───────────────────
  const pool       = buildPoolQuenteFria(ctx, qtd);
  const limDesd    = Math.min(300, Math.max(50, qtd * 10));
  const combosDesd = combinacoes(pool, minNumbers, limDesd);

  for (const combo of combosDesd) {
    const key = combo.join(',');
    if (vistos.has(key)) continue;
    if (!validarJogo(combo, totalNumbers, minNumbers)) continue;
    vistos.add(key);
    validados.push({ jogo: combo, origem: 'desdobramento' });
  }

  // ── PASSO 4: Algoritmo Evolutivo v3.1 ────────────────────
  //    5 gerações, mutação adaptativa, momentum integrado
  const popSize = Math.min(200, Math.max(100, qtd * 15));
  const evolved = evolvePopulation(
    validados.slice(0, popSize),
    statCtx.config,
    statCtx.compositeWeights,
    statCtx.adjustedDelay,
    statCtx.matrix,
    statCtx.posWeights,
    statCtx.gapProfile,
    statCtx.confidence,
    2,
    popSize,
    statCtx.momentum,
  );

  // ── PASSO 5: Score híbrido (mestre v3.1 normalizado) ─────
  const pontuados: SharkResult[] = evolved.map(e => ({
    jogo:      e.jogo,
    score:     e.masterScore * 3,
    origem:    e.origem,
    riskLevel: e.riskLevel,
  }));

  const evolvedKeys = new Set(evolved.map(e => e.jogo.join(',')));
  for (const v of validados) {
    if (evolvedKeys.has(v.jogo.join(','))) continue;
    const { score: ms, riskLevel } = computeMasterScore(
      v.jogo,
      statCtx.config,
      statCtx.compositeWeights,
      statCtx.adjustedDelay,
      statCtx.matrix,
      statCtx.posWeights,
      statCtx.gapProfile,
      statCtx.confidence,
      statCtx.momentum,
    );
    pontuados.push({ jogo: v.jogo, score: ms * 3, origem: v.origem, riskLevel });
  }

  pontuados.sort((a, b) => b.score - a.score);

  // ── PASSO 6: Filtro de diversidade (Jaccard) ─────────────
  const density     = minNumbers / totalNumbers;
  const minDistance = density > 0.40 ? 0.15 : 0.30;

  const diversificados = filterByDiversity(pontuados, minDistance, qtd * 4);

  // ── PASSO 7: Maximização de cobertura ────────────────────
  const comCobertura = maximizeCoverage(diversificados, totalNumbers, qtd * 2);

  // ── PASSO 8: Entrega os N melhores ───────────────────────
  const melhores = comCobertura.slice(0, qtd);

  if (melhores.length < qtd) {
    const melhoresKeys = new Set(melhores.map(m => m.jogo.join(',')));
    for (const p of pontuados) {
      if (melhores.length >= qtd) break;
      if (!melhoresKeys.has(p.jogo.join(','))) melhores.push(p);
    }
  }

  return {
    jogos: melhores,
    contexto: {
      hot:               ctx.hot.slice(0, 10),
      warm:              ctx.warm.slice(0, 10),
      cold:              ctx.cold.slice(0, 10),
      totalCandidatos:   candidatos.length + combosDesd.length,
      totalValidados:    validados.length,
      estrategiasUsadas: [
        ...ESTRATEGIAS_BASE.map(e => e.nome),
        'peso_dinamico', 'janela_ponderada', 'nucleo_variacao',
        'momentum', 'anti_cluster', 'desdobramento', 'evolutivo',
      ],
      confidence: statCtx.confidence,
    },
  };
}

// ============================================================
//  Desdobramento externo (mantido — 100% compatível)
// ============================================================

export function gerarDesdobramento(
  jogos:      SharkResult[],
  minNumbers: number,
  limite:     number = 500,
): DesdobramentoOutput {
  const pool = [...new Set(jogos.flatMap(j => j.jogo))].sort((a, b) => a - b);
  if (pool.length < minNumbers) return { combinacoes: [], total: 0, poolUsado: pool };
  const combos = combinacoes(pool, minNumbers, limite);
  return { combinacoes: combos, total: combos.length, poolUsado: pool };
}

// Alias de compatibilidade
export { gerarJogosMaster as sharkAutonomo };
