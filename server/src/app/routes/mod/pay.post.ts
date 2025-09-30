import { Router, Request, Response } from "express";
import type { Pool } from "pg";
import logger from "../../../logger";
import { getUserBalance } from "../../../features/currency/repo";

interface PayBody {
  fromUuid?: string;
  toUuid: string;
  amount: number;
}

interface PayResponse {
  success?: true;
  new_sender_balance?: number;
  error?: string;
}

export default function registerPay(router: Router, db: Pool) {
  router.post(
    "/currency/pay",
    async (
      req: Request<{}, PayResponse, PayBody>,
      res: Response<PayResponse>
    ) => {
      const { fromUuid, toUuid, amount } = req.body;
      const serverId = req.user?.serverId as number | undefined;
      const from_uuid = fromUuid ?? (req.user?.uuid as string | undefined);
      const to_uuid = toUuid;

      if (!serverId || !from_uuid || !to_uuid || typeof amount !== "number") {
        return res.status(400).json({ error: "Invalid input" });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }
      if (from_uuid === to_uuid) {
        return res.status(400).json({ error: "Cannot pay yourself" });
      }

      try {
        const current = await getUserBalance(db, serverId, from_uuid);
        if (current === null) {
          return res.status(404).json({ error: "Sender not found" });
        }
        if (current < amount) {
          return res.status(400).json({ error: "Insufficient funds" });
        }

        const recipExists = await db.query(
          `SELECT 1
             FROM players
            WHERE server_id = $1 AND minecraft_uuid = $2
            LIMIT 1`,
          [serverId, to_uuid]
        );
        if (recipExists.rowCount === 0) {
          return res.status(404).json({ error: "Recipient not found" });
        }
      } catch (e) {
        logger.error("/currency/pay preflight error:", e);
        return res.status(500).json({ error: "Internal server error" });
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

        await client.query(
          `
          INSERT INTO accounts (group_id, holder_uuid, balance)
          VALUES ($1, $2, 0)
          ON CONFLICT (group_id, holder_uuid) DO NOTHING
        `,
          [groupId, from_uuid]
        );
        await client.query(
          `
          INSERT INTO accounts (group_id, holder_uuid, balance)
          VALUES ($1, $2, 0)
          ON CONFLICT (group_id, holder_uuid) DO NOTHING
        `,
          [groupId, to_uuid]
        );

        const accRes = await client.query<{
          id: number;
          holder_uuid: string;
          balance: string;
        }>(
          `
          SELECT id, holder_uuid, balance
            FROM accounts
           WHERE group_id = $1
             AND holder_uuid IN ($2, $3)
           FOR UPDATE
          `,
          [groupId, from_uuid, to_uuid]
        );

        if (accRes.rowCount !== 2) {
          const haveFrom = accRes.rows.some((r) => r.holder_uuid === from_uuid);
          const haveTo = accRes.rows.some((r) => r.holder_uuid === to_uuid);
          if (!haveFrom) throw new Error("Sender not found");
          if (!haveTo) throw new Error("Recipient not found");
          throw new Error("Bad request");
        }

        const sender = accRes.rows.find((r) => r.holder_uuid === from_uuid)!;
        const recipient = accRes.rows.find((r) => r.holder_uuid === to_uuid)!;

        const [first, second] =
          sender.id < recipient.id ? [sender, recipient] : [recipient, sender];

        const senderBal = Math.floor(parseFloat(sender.balance));
        if (senderBal < amount) {
          throw new Error("Insufficient funds");
        }

        await client.query(
          `UPDATE accounts
              SET balance = balance - $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [amount, sender.id]
        );
        const recipUpd = await client.query<{ balance: string }>(
          `UPDATE accounts
              SET balance = balance + $1,
                  updated_at = NOW()
            WHERE id = $2
        RETURNING balance`,
          [amount, recipient.id]
        );

        await client.query("COMMIT");

        const newSenderBal = senderBal - amount;
        return res.json({ success: true, new_sender_balance: newSenderBal });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/currency/pay error:", error);
        const msg =
          typeof error?.message === "string" ? error.message : "Bad request";
        const code =
          msg === "Sender not found" || msg === "Recipient not found"
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
