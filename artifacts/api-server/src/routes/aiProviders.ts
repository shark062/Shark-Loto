import { Router } from "express";
import {
  listProviders,
  addProvider,
  updateProvider,
  deleteProvider,
  testProvider,
  callBestProvider,
  getEvolutionLog,
  initDefaultProviders,
  providers,
} from "../lib/aiProviders";

const router = Router();

router.get("/", (_req, res) => {
  res.json(listProviders());
});

router.get("/evolution", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  res.json({ log: getEvolutionLog(limit) });
});

router.post("/", async (req, res) => {
  const { type, name, apiKey, model, baseUrl } = req.body;
  if (!type || !name || !apiKey) {
    res.status(400).json({ message: "type, name e apiKey são obrigatórios" }); return;
  }
  try {
    const provider = await addProvider({ type, name, apiKey, model, baseUrl });
    res.status(201).json({ ...provider, apiKey: undefined });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await updateProvider(req.params.id, req.body);
    if (!updated) { res.status(404).json({ message: "Provider não encontrado" }); return; }
    res.json({ ...updated, apiKey: undefined });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const updated = await updateProvider(req.params.id, req.body);
    if (!updated) { res.status(404).json({ message: "Provider não encontrado" }); return; }
    res.json({ ...updated, apiKey: undefined });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await deleteProvider(req.params.id);
    if (!ok) { res.status(404).json({ message: "Provider não encontrado" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/test", async (req, res) => {
  try {
    const result = await testProvider(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/sync-env", async (_req, res) => {
  try {
    const before = [...providers.values()].filter(p => p.enabled).length;
    await initDefaultProviders();
    const after = [...providers.values()].filter(p => p.enabled).length;
    const { providers: list } = listProviders();
    res.json({
      success: true,
      message: "Providers sincronizados das variáveis de ambiente",
      before,
      after,
      providers: list.map(p => ({ name: p.name, type: p.type, enabled: p.enabled, hasEnvKey: (p as any).hasEnvKey })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/chat", async (req, res) => {
  const { prompt, systemPrompt } = req.body;
  if (!prompt) { res.status(400).json({ message: "prompt é obrigatório" }); return; }
  try {
    const text = await callBestProvider(prompt, systemPrompt);
    res.json({ text });
  } catch (err: any) {
    res.status(503).json({ message: err.message });
  }
});

export default router;
