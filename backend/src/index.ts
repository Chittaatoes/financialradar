import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { log, requestLogger } from "./middleware/logger";

const app = express();
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  cors({
    origin: [
      "https://financialradar.vercel.app",
      "http://localhost:5173",
      "http://localhost:5000",
      process.env.FRONTEND_URL || "",
    ].filter(Boolean),
    credentials: true,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

(async () => {
  await registerRoutes(app);

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
