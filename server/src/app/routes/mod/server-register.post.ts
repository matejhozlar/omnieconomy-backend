import { Router, Request, Response } from "express";
import type { Deps } from "./index";
import type { Pool } from "pg";
import crypto from "crypto";
import argon2 from "argon2";
import logger from "../../../logger";

interface ServerRegisterBody {
  name?: string;
}

interface ServerRegisterRes {
  serverId?: number;
  groupId?: number;
  apiKey?: string;
  error?: string;
}

export default function registerServerRegister(router: Router, deps: Deps) {
  router.post(
    "/servers/register",
    async (
      req: Request<{}, ServerRegisterRes, ServerRegisterBody>,
      res: Response<ServerRegisterRes>
    ) => {
      const rawName = req.body.name?.trim();
      const nameOrNull = rawName && rawName.length > 0 ? rawName : null;

      const regSecret = process.env.REGISTRATION_SECRET;
      if (regSecret) {
        const provided = req.header("X-Registration-Secret");
        if (provided !== regSecret) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const client = await deps.db.connect();
      try {
        await client.query("BEGIN");

        const apiKey = crypto.randomBytes(24).toString("base64url");
        const apiKeyHash = await argon2.hash(
          apiKey + (process.env.SERVER_API_SALT || "")
        );

        const grp = await client.query<{ id: number }>(
          `INSERT INTO server_groups (name) VALUES ($1) RETURNING id`,
          [nameOrNull]
        );
        const groupId = grp.rows[0].id;

        const srv = await client.query<{ id: number }>(
          `
          INSERT INTO servers (name, api_key_hash, group_id)
          VALUES ($1, $2, $3)
          RETURNING id
          `,
          [nameOrNull, apiKeyHash, groupId]
        );
        const serverId = srv.rows[0].id;

        await client.query("COMMIT");
        return res.status(201).json({ serverId, groupId, apiKey });
      } catch (error: any) {
        await client.query("ROLLBACK");
        logger.error("/servers/register error:", error);
        if (error?.code === "23505") {
          return res.status(409).json({ error: "Server name already exists" });
        }
        return res.status(500).json({ error: "Internal server error" });
      } finally {
        client.release();
      }
    }
  );
}
