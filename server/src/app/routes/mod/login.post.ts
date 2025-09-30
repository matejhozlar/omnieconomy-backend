import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import type { Deps } from "./index";

interface LoginBody {
  uuid?: string;
  name?: string;
}
interface LoginRes {
  token?: string;
  error?: string;
}

export default function registerLogin(router: Router, { db }: Deps) {
  router.post(
    "/currency/login",
    async (req: Request<{}, LoginRes, LoginBody>, res: Response<LoginRes>) => {
      const { uuid, name } = req.body;
      if (!uuid || !name) {
        return res.status(400).json({ error: "Missing uuid or name" });
      }

      const serverIdHeader = req.header("X-Server-Id");
      const serverKey = req.header("X-Server-Key") || "";
      const serverId = Number(serverIdHeader);

      if (!serverId || !Number.isFinite(serverId) || !serverKey) {
        return res.status(401).json({ error: "Missing server credentials" });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const srv = await client.query<{
          api_key_hash: string;
          group_id: number | null;
        }>(`SELECT api_key_hash, group_id FROM servers WHERE id = $1 LIMIT 1`, [
          serverId,
        ]);
        if (srv.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(401).json({ error: "Invalid server" });
        }
        const ok = await argon2.verify(
          srv.rows[0].api_key_hash,
          serverKey + (process.env.SERVER_API_SALT || "")
        );
        if (!ok) {
          await client.query("ROLLBACK");
          return res.status(401).json({ error: "Invalid server key" });
        }

        let groupId = srv.rows[0].group_id;
        if (groupId == null) {
          const g = await client.query<{ id: number }>(
            `INSERT INTO server_groups (name) VALUES ($1) RETURNING id`,
            [null]
          );
          groupId = g.rows[0].id;
          await client.query(`UPDATE servers SET group_id = $1 WHERE id = $2`, [
            groupId,
            serverId,
          ]);
        }

        const upsertPlayer = await client.query<{ id: number }>(
          `
          INSERT INTO players (server_id, minecraft_uuid, username)
          VALUES ($1, $2, $3)
          ON CONFLICT (server_id, minecraft_uuid)
          DO UPDATE SET username = EXCLUDED.username
          RETURNING id
          `,
          [serverId, uuid, name]
        );
        const playerId = upsertPlayer.rows[0].id;

        const upsertAccount = await client.query<{ id: number }>(
          `
          INSERT INTO accounts (group_id, holder_uuid, balance)
          VALUES ($1, $2, 0)
          ON CONFLICT (group_id, holder_uuid)
          DO UPDATE SET updated_at = NOW()
          RETURNING id
          `,
          [groupId, uuid]
        );
        const accountId = upsertAccount.rows[0].id;

        await client.query("COMMIT");

        const token = jwt.sign(
          { uuid, name, serverId, groupId, playerId, accountId },
          process.env.JWT_SECRET as string,
          { expiresIn: "10m" }
        );

        return res.json({ token });
      } catch (e) {
        await db.query("ROLLBACK");
        return res.status(500).json({ error: "Internal server error" });
      } finally {
        client.release();
      }
    }
  );
}
