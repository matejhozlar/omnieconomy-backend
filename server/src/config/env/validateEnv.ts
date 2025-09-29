import logger from "../../logger";
import { REQUIRED_VARS, type RequiredEnvVar } from "./vars/requiredVars";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * Checks that all required environment variables are set.
 * Logs an error and exits with code 1 if any are missing.
 */
export function validateEnv(): void {
  let hasError = false;

  for (const key of REQUIRED_VARS) {
    const value = process.env[key as RequiredEnvVar];
    if (!value) {
      logger.error("Missing required env variable:", key);
      hasError = true;
    }
  }

  if (hasError) {
    logger.error("Environment validation failed. Exiting");
    process.exit(1);
  }

  logger.info("All required environment variables are set");
}
