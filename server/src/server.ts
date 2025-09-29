import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import type { Express, Request, Response } from "express";

import dotenv from "dotenv";
dotenv.config({ quiet: true });
import logger from "./logger";
import { validateEnv } from "./config/env/validateEnv";
validateEnv();
import { createApp } from "./app/index";
import registerRoutes from "./app/routes";
import db from "./db/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reactBuildPath = path.resolve(__dirname, "..", "..", "client", "dist");

const PORT = process.env.PORT;

const app = createApp();

registerRoutes(app, { db });

app.get("/*", (req, res) => {
  res.sendFile(path.join(reactBuildPath, "index.html"));
});

const httpServer = http.createServer(app);

httpServer.listen(PORT, () => {
  logger.info(`Server started on http://localhost:${PORT}`);
});

process.on("SIGINT", (signal: NodeJS.Signals) => {
  logger.info("Shutting down…", signal);
  httpServer.close((err?: Error) => {
    if (err) {
      logger.error("Error during shutdown:", err);
      process.exit(1);
    }
    logger.info("Server closed. Exiting…");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled promise rejection:", reason);
});
