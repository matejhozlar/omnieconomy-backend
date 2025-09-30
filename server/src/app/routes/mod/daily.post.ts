import { Router, Request, Response } from "express";
import type { Deps } from "./index";
import { DateTime } from "luxon";
import logger from "../../../logger";

interface DailyResponse {
  message?: string;
  new_balance?: number;
  error?: string;
}

export default function registerDaily(router: Router, { db }: Deps) {
  router.post(
    "/currency/daily",
    async (req: Request, res: Response<DailyResponse>) => {
      const uuid = req.user?.uuid as string | undefined;
      const serverId = req.user?.serverId as number | undefined;

      if (!uuid || !serverId) {
        return res.status(400).json({ error: "Missing uuid or serverId" });
      }

      const DAILY_REWARD_AMOUNT = 50;
      const TIMEZONE = "Europe/Berlin";
      const now = DateTime.now().setZone(TIMEZONE);

      const getLastReset = (ts: DateTime) => {
        let resetTime = ts.set({
          hour: 6,
          minute: 30,
          second: 0,
          millisecond: 0,
        });
        if (ts < resetTime) resetTime = ts.minus({ days: 1 });
        return resetTime;
      };
      const lastReset = getLastReset(now);

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const linkRes = await client.query<{ discord_id: string | null }>(
          `SELECT discord_id
             FROM players
            WHERE server_id = $1 AND minecraft_uuid = $2
            LIMIT 1`,
          [serverId, uuid]
        );
        if (linkRes.rowCount === 0 || !linkRes.rows[0].discord_id) {
          await client.query("ROLLBACK");
          return res.status(404).json({
            error: "Your Minecraft account is not linked to Discord.",
          });
        }

        const accRes = await client.query<{
          account_id: number;
          balance: string;
        }>(
          `
          SELECT a.id AS account_id, a.balance
            FROM servers s
            JOIN accounts a ON a.group_id = s.group_id AND a.holder_uuid = $2
           WHERE s.id = $1
           FOR UPDATE
          `,
          [serverId, uuid]
        );
        if (accRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Account not found." });
        }
        const accountId = accRes.rows[0].account_id;
        const currentBal = Math.floor(parseFloat(accRes.rows[0].balance));

        const rewardRes = await client.query<{ last_claim_at: Date }>(
          `SELECT last_claim_at
             FROM daily_rewards
            WHERE account_id = $1
            FOR UPDATE`,
          [accountId]
        );
        if (
          (rewardRes.rowCount ?? 0) > 0 &&
          DateTime.fromJSDate(rewardRes.rows[0].last_claim_at).setZone(
            TIMEZONE
          ) >= lastReset
        ) {
          await client.query("ROLLBACK");
          const nextReset = lastReset.plus({ days: 1 });
          const diff = nextReset.diff(now, ["hours", "minutes"]).toObject();
          const hours = Math.floor(diff.hours ?? 0);
          const minutes = Math.floor(diff.minutes ?? 0);
          return res.status(429).json({
            error: `⏳ You already claimed your daily reward. Next reset in ${hours}h ${minutes}m.`,
          });
        }

        const updAcc = await client.query<{ balance: string }>(
          `UPDATE accounts
              SET balance = balance + $1,
                  updated_at = NOW()
            WHERE id = $2
        RETURNING balance`,
          [DAILY_REWARD_AMOUNT, accountId]
        );

        await client.query(
          `INSERT INTO daily_rewards (account_id, last_claim_at)
           VALUES ($1, $2)
           ON CONFLICT (account_id)
           DO UPDATE SET last_claim_at = EXCLUDED.last_claim_at`,
          [accountId, now.toJSDate()]
        );

        await client.query("COMMIT");

        const newBalance = Math.floor(parseFloat(updAcc.rows[0].balance));
        const formatted = newBalance.toLocaleString("en-US");
        return res.json({
          message: `You claimed your daily reward of $${DAILY_REWARD_AMOUNT}!\n💰 New Balance: $${formatted}`,
          new_balance: newBalance,
        });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/currency/daily error:", error);
        return res.status(500).json({
          error: "Something went wrong while claiming your daily reward.",
        });
      } finally {
        client.release();
      }
    }
  );
}
