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
      const uuid = req.body.uuid ?? req.user?.uuid;

      if (!uuid || typeof amount !== "number") {
        return res.status(400).json({ error: "Invalid input" });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const result = await client.query<{ balance: string }>(
          `UPDATE user_funds
             SET balance = balance + $1
           WHERE uuid = $2
           RETURNING balance`,
          [amount, uuid]
        );

        if (result.rowCount === 0) {
          throw new Error("User not found");
        }

        const rawNew = result.rows[0].balance;
        const newBalance = Math.floor(parseFloat(rawNew));

        await client.query("COMMIT");

        return res.json({ success: true, new_balance: newBalance });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/currency/deposit error:", error);
        const msg =
          typeof error?.message === "string" ? error.message : "Bad request";
        const code = msg === "User not found" ? 404 : 400;
        return res.status(code).json({ error: msg });
      } finally {
        client.release();
      }
    }
  );
}
