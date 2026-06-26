import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "NEON_DATABASE_URL ou DATABASE_URL deve estar definido.",
  );
}

const isLocalhost =
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1");

export const pool = new Pool({
  connectionString,
  ssl: isLocalhost ? undefined : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});

export const db = drizzle(pool, { schema });

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_games" (
        "id" serial PRIMARY KEY,
        "lottery_id" text NOT NULL,
        "selected_numbers" jsonb NOT NULL,
        "strategy" text NOT NULL DEFAULT 'mixed',
        "confidence" numeric,
        "reasoning" text,
        "data_source" text,
        "shark_score" numeric,
        "shark_origem" text,
        "shark_contexto" jsonb,
        "matches" integer NOT NULL DEFAULT 0,
        "prize_won" text NOT NULL DEFAULT '0',
        "contest_number" integer,
        "status" text NOT NULL DEFAULT 'pending',
        "hits" integer NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "ai_providers" (
        "id" text PRIMARY KEY,
        "type" text NOT NULL,
        "name" text NOT NULL,
        "api_key" text NOT NULL,
        "model" text NOT NULL,
        "base_url" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "priority" integer NOT NULL DEFAULT 0,
        "success_rate" numeric NOT NULL DEFAULT '0.7',
        "total_calls" integer NOT NULL DEFAULT 0,
        "success_calls" integer NOT NULL DEFAULT 0,
        "avg_latency_ms" numeric NOT NULL DEFAULT '0',
        "last_used" text,
        "last_error" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key" text PRIMARY KEY,
        "value" text NOT NULL,
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);
  } finally {
    client.release();
  }
}

export * from "./schema";
