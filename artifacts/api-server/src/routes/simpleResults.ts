/**
 * Simple lottery result endpoints
 * GET /api/megasena, /api/lotofacil, /api/quina, /api/lotomania, /api/todas
 *
 * Returns a lightweight format compatible with the original loto-shark-api spec.
 */

import { Router } from "express";
import { fetchLatestDraw } from "../lib/lotteryData";

const router = Router();

interface SimpleResult {
  loteria: string;
  concurso: string;
  data: string;
  dezenas: string[];
  dezenasOrdemSorteio: string[];
  atualizado_em: string;
  fonte: string;
}

interface CachedEntry {
  data: SimpleResult;
  fetchedAt: number;
}

const simpleCache: Record<string, CachedEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function buscarResultadoSimples(tipo: string): Promise<SimpleResult & { cache: boolean }> {
  const cached = simpleCache[tipo];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { ...cached.data, cache: true };
  }

  const raw = await fetchLatestDraw(tipo);
  if (!raw) throw new Error(`Dados indisponíveis para ${tipo}`);

  const dezenas: string[] = raw.dezenas ?? raw.listaDezenas ?? [];
  const ordemSorteio: string[] = raw.dezenasOrdemSorteio ?? [...dezenas];

  const result: SimpleResult = {
    loteria: tipo,
    concurso: String(raw.numero ?? raw.contestNumber ?? "Último"),
    data: raw.dataApuracao ?? new Date().toLocaleDateString("pt-BR"),
    dezenas,
    dezenasOrdemSorteio: ordemSorteio,
    atualizado_em: new Date().toISOString(),
    fonte: (raw.fonte as string) ?? "api_caixa",
  };

  simpleCache[tipo] = { data: result, fetchedAt: Date.now() };
  return { ...result, cache: false };
}

// GET /api/megasena
router.get("/megasena", async (req, res) => {
  try {
    res.json(await buscarResultadoSimples("megasena"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erro: "Não foi possível obter dados da Mega-Sena", mensagem: msg });
  }
});

// GET /api/lotofacil
router.get("/lotofacil", async (req, res) => {
  try {
    res.json(await buscarResultadoSimples("lotofacil"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erro: "Não foi possível obter dados da Lotofácil", mensagem: msg });
  }
});

// GET /api/quina
router.get("/quina", async (req, res) => {
  try {
    res.json(await buscarResultadoSimples("quina"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erro: "Não foi possível obter dados da Quina", mensagem: msg });
  }
});

// GET /api/lotomania
router.get("/lotomania", async (req, res) => {
  try {
    res.json(await buscarResultadoSimples("lotomania"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erro: "Não foi possível obter dados da Lotomania", mensagem: msg });
  }
});

// GET /api/todas — all four lotteries in parallel, partial failures degrade to null
router.get("/todas", async (req, res) => {
  const [megasena, lotofacil, quina, lotomania] = await Promise.all([
    buscarResultadoSimples("megasena").catch((): null => null),
    buscarResultadoSimples("lotofacil").catch((): null => null),
    buscarResultadoSimples("quina").catch((): null => null),
    buscarResultadoSimples("lotomania").catch((): null => null),
  ]);
  res.json({ megasena, lotofacil, quina, lotomania, atualizado_em: new Date().toISOString() });
});

export default router;
