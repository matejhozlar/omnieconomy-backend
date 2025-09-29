import { Pool } from "pg";
import logger from "../logger.js";
import config from "../config/index";

const { IDLE_TIMEOUT_MS, CONNECTION_TIMEOUT_MS } = config.db;

interface DbEnv {
  DB_USER?: string;
  DB_HOST?: string;
  DB_DATABASE?: string;
  DB_PASSWORD?: string;
  DB_PORT?: string | number;
}

const env: DbEnv = {
  DB_USER: process.env.DB_USER,
  DB_HOST: process.env.DB_HOST,
  DB_DATABASE: process.env.DB_DATABASE,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_PORT: process.env.DB_PORT,
};

const db = new Pool({
  user: env.DB_USER,
  host: env.DB_HOST,
  database: env.DB_DATABASE,
  password: env.DB_PASSWORD,
  port: env.DB_PORT ? Number(env.DB_PORT) : undefined,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
});

(async () => {
  try {
    await db.query("SELECT 1");
    logger.info("Connected to PostgreSQL database");
  } catch (error) {
    logger.error(`Failed to connect to DB: ${error}`);
    process.exit(1);
  }
})();

export default db;
