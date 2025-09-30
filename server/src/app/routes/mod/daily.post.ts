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
      const uuid = req.user?.uuid;

      if (!uuid) {
        return res.status(400).json({ error: "Missing uuid" });
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
        if (ts < resetTime) {
          resetTime = resetTime.minus({ days: 1 });
        }
        return resetTime;
      };

      const lastReset = getLastReset(now);

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const linkRes = await client.query<{ discord_id: string }>(
          `SELECT discord_id FROM users WHERE uuid = $1 LIMIT 1`,
          [uuid]
        );
        if (linkRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({
            error: "Your Minecraft account is not linked to Discord.",
          });
        }
        const discordId = linkRes.rows[0].discord_id;

        const userRes = await client.query<{ balance: string }>(
          `SELECT balance FROM user_funds WHERE uuid = $1 FOR UPDATE`,
          [uuid]
        );
        if (userRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "User not found." });
        }
        const currentBal = Math.floor(parseFloat(userRes.rows[0].balance));

        const rewardRes = await client.query<{ last_claim_at: Date }>(
          `SELECT last_claim_at FROM daily_rewards WHERE discord_id = $1 FOR UPDATE`,
          [discordId]
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

        await client.query(
          `UPDATE user_funds SET balance = balance + $1 WHERE uuid = $2`,
          [DAILY_REWARD_AMOUNT, uuid]
        );
        await client.query(
          `INSERT INTO daily_rewards (discord_id, last_claim_at)
           VALUES ($1, $2)
           ON CONFLICT (discord_id)
           DO UPDATE SET last_claim_at = EXCLUDED.last_claim_at`,
          [discordId, now.toJSDate()]
        );

        await client.query("COMMIT");

        const newBalance = currentBal + DAILY_REWARD_AMOUNT;
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
