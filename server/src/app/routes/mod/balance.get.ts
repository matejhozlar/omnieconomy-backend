import { Router, Request, Response } from "express";
import type { Deps } from "./index";

interface BalanceRes {
  balance?: number;
  error?: string;
}

export default function registerBalance(router: Router, { db }: Deps) {
  router.get(
    "/currency/balance",
    async (req: Request, res: Response<BalanceRes>) => {
      const uuid = req.user?.uuid;
      if (!uuid) return res.status(400).json({ error: "Missing uuid" });

      try {
        const result = await db.query<{ balance: string }>(
          "SELECT balance FROM user_funds WHERE uuid = $1 LIMIT 1",
          [uuid]
        );
        if (result.rowCount === 0)
          return res.status(404).json({ error: "Player not found" });

        const balance = Math.floor(parseFloat(result.rows[0].balance));
        return res.json({ balance });
      } catch (e) {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}
