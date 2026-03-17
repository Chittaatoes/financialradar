import 'dotenv/config'; 
import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./backend/shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ssl: true,
  },
});
