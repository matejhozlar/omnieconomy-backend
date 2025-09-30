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
      const uuid = req.body.uuid ?? req.user?.uuid;

      if (!uuid || typeof count !== "number" || count <= 0) {
        return res.status(400).json({ error: "Invalid count or uuid" });
      }

      const denom = typeof denomination === "number" ? denomination : 1000;
      const amount = count * denom;

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const result = await client.query<{ balance: string }>(
          `SELECT balance FROM user_funds WHERE uuid = $1 FOR UPDATE`,
          [uuid]
        );
        if (result.rowCount === 0) {
          throw new Error("User not found");
        }

        const rawBal = result.rows[0].balance;
        const currentBalance = Math.floor(parseFloat(rawBal));
        if (currentBalance < amount) {
          throw new Error("Insufficient funds");
        }

        const updateRes = await client.query<{ balance: string }>(
          `UPDATE user_funds
             SET balance = balance - $1
           WHERE uuid = $2
           RETURNING balance`,
          [amount, uuid]
        );

        await client.query("COMMIT");

        const rawAfter = updateRes.rows[0].balance;
        const newBalance = Math.floor(parseFloat(rawAfter));

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
        return res.status(400).json({ error: msg });
      } finally {
        client.release();
      }
    }
  );
}
