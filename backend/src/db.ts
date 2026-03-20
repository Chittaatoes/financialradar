import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 8_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] Idle client error:", err.message);
});

// Warm up one connection on startup so the first real request is fast
pool.connect().then((client) => {
  client.query("SELECT 1").catch(() => {}).finally(() => client.release());
}).catch(() => {});

// Heartbeat every 4 minutes to prevent Supabase from closing idle connections
setInterval(() => {
  pool.query("SELECT 1").catch(() => {});
}, 4 * 60 * 1000);

export const db = drizzle(pool, { schema });

/**
 * Ensure all application tables exist in the database.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup —
 * it is a no-op when the tables already exist.
 */
export async function ensureSchema(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          VARCHAR PRIMARY KEY,
        email       VARCHAR UNIQUE,
        first_name  VARCHAR,
        last_name   VARCHAR,
        profile_image_url TEXT,
        is_guest    BOOLEAN NOT NULL DEFAULT FALSE,
        role        VARCHAR NOT NULL DEFAULT 'user',
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forex_trades (
        id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id     VARCHAR NOT NULL REFERENCES users(id),
        symbol      TEXT NOT NULL,
        type        TEXT NOT NULL,
        lot         NUMERIC(10,2) NOT NULL,
        open_price  NUMERIC(15,5) NOT NULL,
        close_price NUMERIC(15,5) NOT NULL,
        profit      NUMERIC(15,2) NOT NULL,
        source      TEXT NOT NULL DEFAULT 'image',
        created_at  TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trading_rules (
        id                     INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id                VARCHAR NOT NULL UNIQUE REFERENCES users(id),
        max_loss_percent       NUMERIC(5,2) NOT NULL DEFAULT 1,
        target_profit_percent  NUMERIC(5,2) NOT NULL DEFAULT 2,
        max_trades_per_day     INTEGER NOT NULL DEFAULT 10,
        revenge_window_minutes INTEGER NOT NULL DEFAULT 5,
        updated_at             TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trading_stats_daily (
        id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id      VARCHAR NOT NULL REFERENCES users(id),
        date         DATE NOT NULL,
        total_profit NUMERIC(15,2) NOT NULL DEFAULT 0,
        total_loss   NUMERIC(15,2) NOT NULL DEFAULT 0,
        net          NUMERIC(15,2) NOT NULL DEFAULT 0,
        trade_count  INTEGER NOT NULL DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trading_risk_settings (
        id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id      VARCHAR NOT NULL UNIQUE REFERENCES users(id),
        balance      NUMERIC(15,2) NOT NULL DEFAULT 100,
        currency     TEXT NOT NULL DEFAULT 'USD',
        account_type TEXT NOT NULL DEFAULT 'standard',
        risk_percent NUMERIC(5,2) NOT NULL DEFAULT 1,
        updated_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[db] Schema ensured — all tables ready.");
  } catch (err: any) {
    console.error("[db] ensureSchema error:", err.message);
  }
}
