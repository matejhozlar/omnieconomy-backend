import type { Pool } from "pg";

/**
 * Returns the player's balance in the context of a server group.
 *
 * @param db        - pg pool
 * @param serverId  - the server the player belongs to (used to resolve group_id)
 * @param uuid      - the player's Minecraft UUID
 * @returns number  - balance (floored), or null if account not found
 */
export async function getUserBalance(
  db: Pool,
  serverId: number,
  uuid: string
): Promise<number | null> {
  const q = `
    SELECT a.balance
      FROM accounts a
      JOIN servers s ON s.group_id = a.group_id
     WHERE s.id = $1
       AND a.holder_uuid = $2
     LIMIT 1
  `;

  const result = await db.query<{ balance: string }>(q, [serverId, uuid]);
  if (result.rows.length === 0) return null;

  const raw = result.rows[0].balance;
  return Math.floor(parseFloat(raw));
}
