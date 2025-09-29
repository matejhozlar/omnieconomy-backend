import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { validateEnv } from "./config/env/validateEnv";
validateEnv();

import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import type { Express, Request, Response } from "express";

import logger from "./logger";
import { createApp } from "./app/createApp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reactBuildPath = path.resolve(__dirname, "..", "..", "client", "dist");

/**
 * Starts the HTTP server.
 * @param port Optional port number. Defaults to process.env.PORT or 3001.
 * @returns The created Node HTTP server instance.
 */
export function startServer(port?: number): http.Server {
  const app: Express = createApp();

  app.get("/*", (_req: Request, res: Response) => {
    res.sendFile(path.join(reactBuildPath, "index.html"));
  });

  const resolvedPort = Number(port ?? process.env.PORT ?? 5000);
  if (!Number.isFinite(resolvedPort)) {
    logger.error("Invalid PORT value:", process.env.PORT);
    process.exit(1);
  }

  const server = http.createServer(app);
  server.listen(resolvedPort, () => {
    logger.info(`Server running at http://localhost:${resolvedPort}`);
  });

  return server;
}

const server = startServer();

/**
 * Handles graceful shutdown on SIGINT (Ctrl+C).
 * @param signal The signal name (SIGINT).
 */
process.on("SIGINT", (signal: NodeJS.Signals) => {
  logger.info("Shutting down...", signal);

  try {
    server.close((err?: Error) => {
      if (err) {
        logger.error("Error during shutdown:", err);
        process.exit(1);
      }
      logger.info("Server closed. Exiting...");
      process.exit(0);
    });
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
});

/**
 * Logs unhandled promise rejections.
 * @param reason Reason for the unhandled rejection.
 */
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled promise rejection:", reason);
});
