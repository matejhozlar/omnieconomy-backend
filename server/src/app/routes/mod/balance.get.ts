import { Router, Request, Response } from "express";
import type { Deps } from "./index";
import { getUserBalance } from "../../../features/currency/repo";

interface BalanceRes {
  balance?: number;
  error?: string;
}

export default function registerBalance(router: Router, { db }: Deps) {
  router.get(
    "/currency/balance",
    async (req: Request, res: Response<BalanceRes>) => {
      const uuid = req.user?.uuid;
      const serverId = req.user?.serverId;

      if (!uuid || !serverId) {
        return res.status(400).json({ error: "Missing uuid or serverId" });
      }

      try {
        const balance = await getUserBalance(db, serverId, uuid);
        if (balance === null) {
          return res.status(404).json({ error: "Player not found" });
        }

        return res.json({ balance });
      } catch (e) {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}
