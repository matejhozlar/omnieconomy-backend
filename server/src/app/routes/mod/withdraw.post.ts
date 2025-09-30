import { Router, Request, Response } from "express";
import type { Deps } from "./index";
import logger from "../../../logger";

interface WithdrawBody {
  count: number;
  denomination?: number;
  uuid?: string;
}

interface WithdrawResponse {
  success?: true;
  withdrawn?: number;
  new_balance?: number;
  denomination?: number;
  count?: number;
  error?: string;
}

export default function registerWithdraw(router: Router, { db }: Deps) {
  router.post(
    "/currency/withdraw",
    async (
      req: Request<{}, WithdrawResponse, WithdrawBody>,
      res: Response<WithdrawResponse>
    ) => {
      const { count, denomination } = req.body;
      const serverId = req.user?.serverId as number | undefined;
      const uuid = (req.body.uuid ?? req.user?.uuid) as string | undefined;

      if (!serverId || !uuid || typeof count !== "number" || count <= 0) {
        return res
          .status(400)
          .json({ error: "Invalid count, uuid or serverId" });
      }

      const denom = typeof denomination === "number" ? denomination : 1000;
      const amount = count * denom;

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

        await client.query(
          `
          INSERT INTO accounts (group_id, holder_uuid, balance)
          VALUES ($1, $2, 0)
          ON CONFLICT (group_id, holder_uuid) DO NOTHING
        `,
          [groupId, uuid]
        );

        const accRes = await client.query<{ id: number; balance: string }>(
          `
          SELECT id, balance
            FROM accounts
           WHERE group_id = $1 AND holder_uuid = $2
           FOR UPDATE
          `,
          [groupId, uuid]
        );
        if (accRes.rowCount === 0) {
          throw new Error("Account not found");
        }

        const currentBalance = Math.floor(parseFloat(accRes.rows[0].balance));
        if (currentBalance < amount) {
          throw new Error("Insufficient funds");
        }

        const updateRes = await client.query<{ balance: string }>(
          `
          UPDATE accounts
             SET balance = balance - $1,
                 updated_at = NOW()
           WHERE id = $2
       RETURNING balance
          `,
          [amount, accRes.rows[0].id]
        );

        await client.query("COMMIT");

        const newBalance = Math.floor(parseFloat(updateRes.rows[0].balance));

        return res.json({
          success: true,
          withdrawn: amount,
          new_balance: newBalance,
          denomination: denom,
          count,
        });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/currency/withdraw error:", error);
        const msg =
          typeof error?.message === "string" ? error.message : "Bad request";
        const code =
          msg === "Server not found" || msg === "Account not found"
            ? 404
            : msg === "Insufficient funds"
              ? 400
              : 400;
        return res.status(code).json({ error: msg });
      } finally {
        client.release();
      }
    }
  );
}
