import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const RENDER_API_URL = process.env.RENDER_API_URL?.replace(/\/$/, "");

export function isRenderProxyEnabled(): boolean {
  return !!RENDER_API_URL;
}

export async function proxyToRender(req: Request, res: Response): Promise<void> {
  if (!RENDER_API_URL) {
    res.status(503).json({ error: "RENDER_API_URL não configurado" });
    return;
  }

  const targetUrl = `${RENDER_API_URL}${req.originalUrl}`;

  try {
    const reqHeaders: Record<string, string> = {
      "content-type": "application/json",
      "accept":        "application/json",
    };

    const body =
      req.method !== "GET" && req.method !== "HEAD" && req.body
        ? JSON.stringify(req.body)
        : undefined;

    const response = await fetch(targetUrl, {
      method:  req.method,
      headers: reqHeaders,
      body,
      signal:  AbortSignal.timeout(45_000),
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    res.status(response.status).setHeader("Content-Type", contentType);
    const text = await response.text();
    res.send(text);
  } catch (err: any) {
    logger.error({ err, targetUrl }, "Erro no proxy Render");
    res.status(502).json({
      error:   "Não foi possível conectar ao servidor Render",
      details: err.message,
    });
  }
}

export function renderProxyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!RENDER_API_URL) { next(); return; }
  proxyToRender(req, res);
}
