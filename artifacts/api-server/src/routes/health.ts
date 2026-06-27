import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req: Request, res: Response) => {
  const startedAt = new Date().toISOString();
  const checks: Record<string, { status: "ok" | "error"; detail?: string }> = {};

  let dbOk = false;

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      dbOk = true;
      checks.database = { status: "ok" };

      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('ai_providers', 'user_games')
        ORDER BY table_name
      `);

      const existingTables = tablesResult.rows.map((r: any) => r.table_name) as string[];
      const expectedTables = ["ai_providers", "user_games"];

      for (const t of expectedTables) {
        if (existingTables.includes(t)) {
          const countResult = await client.query(`SELECT COUNT(*) AS total FROM "${t}"`);
          checks[`table:${t}`] = {
            status: "ok",
            detail: `${countResult.rows[0].total} registros`,
          };
        } else {
          checks[`table:${t}`] = { status: "error", detail: "tabela não encontrada" };
        }
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    checks.database = { status: "error", detail: err?.message ?? "falha na conexão" };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const httpStatus = allOk ? 200 : 503;

  res.status(httpStatus).json({
    status: allOk ? "ok" : "degraded",
    timestamp: startedAt,
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV ?? "production",
    checks,
  });
});

export default router;
