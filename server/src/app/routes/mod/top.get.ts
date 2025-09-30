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
      const serverId = req.user?.serverId as number | undefined;
      if (!serverId) {
        return res.status(400).json({ error: "Missing serverId" });
      }

      try {
        const result = await db.query<{ username: string; balance: string }>(
          `
          SELECT p.username, a.balance
            FROM players p
            JOIN servers s
              ON s.id = p.server_id
            JOIN accounts a
              ON a.group_id = s.group_id
             AND a.holder_uuid = p.minecraft_uuid
           WHERE p.server_id = $1
           ORDER BY a.balance DESC
           LIMIT 10
          `,
          [serverId]
        );

        const top: TopUser[] = result.rows.map((r) => ({
          name: r.username,
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
