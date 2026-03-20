import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import { registerRoutes } from "./routes";
import { log, requestLogger } from "./middleware/logger";
import { runWarmup } from "./services/market-cache";
import { ensureSchema } from "./db";

const app = express();
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.APP_URL,
  "http://localhost:5000",
  "http://localhost:5001",
  "http://localhost:5173",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === "null") return callback(null, true);
      const isAllowed =
        allowedOrigins.some((o) => origin === o) ||
        /\.replit\.dev$/.test(origin) ||
        /\.repl\.co$/.test(origin) ||
        /\.replit\.app$/.test(origin) ||
        /\.vercel\.app$/.test(origin) ||
        /\.onrender\.com$/.test(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin);
      if (isAllowed) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

app.get("/health", (_req, res) => {
  // Respond instantly so UptimeRobot sees a fast healthy response,
  // then warm market-data cache in the background.
  res.json({ status: "ok" });
  void runWarmup();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "financialradar-api", ts: Date.now() });
  void runWarmup();
});

(async () => {
  // Auto-create any missing tables on every startup (safe: IF NOT EXISTS)
  await ensureSchema();

  await registerRoutes(app);

  // Pre-warm market cache once at startup so the first user gets fast data
  void runWarmup();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);

  app.listen(port, "0.0.0.0", () => {
    log(`API server running on port ${port}`);
  });
})();
