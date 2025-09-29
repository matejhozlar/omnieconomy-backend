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
      const from_uuid = fromUuid ?? req.user?.uuid;
      const to_uuid = toUuid;

      if (!from_uuid || !to_uuid || typeof amount !== "number") {
        return res.status(400).json({ error: "Invalid input" });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }
      if (from_uuid === to_uuid) {
        return res.status(400).json({ error: "Cannot pay yourself" });
      }

      try {
        const current = await getUserBalance(db, from_uuid);
        if (current === null) {
          return res.status(404).json({ error: "Sender not found" });
        }
        if (current < amount) {
          return res.status(400).json({ error: "Insufficient funds" });
        }
      } catch (e) {
        logger.error("/currency/pay preflight error:", e);
        return res.status(500).json({ error: "Internal server error" });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const senderRes = await client.query<{ balance: string }>(
          `SELECT balance FROM user_funds WHERE uuid = $1 FOR UPDATE`,
          [from_uuid]
        );
        if (senderRes.rowCount === 0) {
          throw new Error("Sender not found");
        }
        const senderBal = Math.floor(parseFloat(senderRes.rows[0].balance));
        if (senderBal < amount) {
          throw new Error("Insufficient funds");
        }

        await client.query(
          `UPDATE user_funds SET balance = balance - $1 WHERE uuid = $2`,
          [amount, from_uuid]
        );

        const recipientRes = await client.query(
          `UPDATE user_funds SET balance = balance + $1 WHERE uuid = $2 RETURNING balance`,
          [amount, to_uuid]
        );
        if (recipientRes.rowCount === 0) {
          throw new Error("Recipient not found");
        }

        const newSenderBal = senderBal - amount;

        await client.query("COMMIT");

        return res.json({ success: true, new_sender_balance: newSenderBal });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/currency/pay error:", error);
        const msg =
          typeof error?.message === "string" ? error.message : "Bad request";
        return res.status(400).json({ error: msg });
      } finally {
        client.release();
      }
    }
  );
}
