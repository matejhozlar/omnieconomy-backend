import { Router, Request, Response } from "express";
import type { Deps } from "./index";
import logger from "../../../logger";

interface DepositBody {
  amount: number;
  uuid?: string;
}

interface DepositResponse {
  success?: true;
  new_balance?: number;
  error?: string;
}

export default function registerDeposit(router: Router, { db }: Deps) {
  router.post(
    "/currency/deposit",
    async (
      req: Request<{}, DepositResponse, DepositBody>,
      res: Response<DepositResponse>
    ) => {
      const { amount } = req.body;
      const jwtUuid = req.user?.uuid as string | undefined;
      const serverId = req.user?.serverId as number | undefined;
      const uuid = (req.body.uuid ?? jwtUuid) as string | undefined;

      if (!uuid || !serverId || typeof amount !== "number") {
        return res.status(400).json({ error: "Invalid input" });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const grp = await client.query<{ group_id: number }>(
          `SELECT group_id FROM servers WHERE id = $1 LIMIT 1`,
          [serverId]
        );
        if (grp.rowCount === 0 || grp.rows[0].group_id == null) {
          throw new Error("Server not found");
        }
        const groupId = grp.rows[0].group_id;

        const upsert = await client.query<{ balance: string }>(
          `
          INSERT INTO accounts (group_id, holder_uuid, balance)
          VALUES ($1, $2, $3)
          ON CONFLICT (group_id, holder_uuid)
          DO UPDATE SET
            balance   = accounts.balance + EXCLUDED.balance,
            updated_at = NOW()
          RETURNING balance
          `,
          [groupId, uuid, amount]
        );

        await client.query("COMMIT");

        const newBalance = Math.floor(parseFloat(upsert.rows[0].balance));
        return res.json({ success: true, new_balance: newBalance });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/currency/deposit error:", error);
        const msg =
          typeof error?.message === "string" ? error.message : "Bad request";
        const code =
          msg === "Server not found"
            ? 404
            : msg === "User not found"
              ? 404
              : 400;
        return res.status(code).json({ error: msg });
      } finally {
        client.release();
      }
    }
  );
}
