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
