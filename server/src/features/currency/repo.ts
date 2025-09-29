import type { Pool } from "pg";

export async function getUserBalance(
  db: Pool,
  uuid: string
): Promise<number | null> {
  const result = await db.query<{ balance: string }>(
    "SELECT balance FROM user_funds WHERE uuid = $1 LIMIT 1",
    [uuid]
  );

  if (result.rows.length === 0) return null;

  const raw = result.rows[0].balance;
  return Math.floor(parseFloat(raw));
}
