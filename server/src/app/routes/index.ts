import { Express } from "express";
import type { Pool } from "pg";
import modRouter from "./mod";

export default function registerRoutes(app: Express, { db }: { db: Pool }) {
  app.use("/api", modRouter({ db }));
}
