import { Router, Request, Response } from "express";
import type { Deps } from "./index";
import logger from "../../../logger";

interface TopUser {
  name: string;
  balance: number;
}

type TopResponse = TopUser[] | { error: string };

export default function registerTop(router: Router, { db }: Deps) {
  router.get(
    "/currency/top",
    async (req: Request, res: Response<TopResponse>) => {
      try {
        const result = await db.query<{ name: string; balance: string }>(
          `SELECT name, balance
             FROM user_funds
             ORDER BY balance DESC
             LIMIT 10`
        );

        const top: TopUser[] = result.rows.map((r) => ({
          name: r.name,
          balance: Math.floor(parseFloat(r.balance)),
        }));

        return res.json(top);
      } catch (error) {
        logger.error("/currency/top error:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}
