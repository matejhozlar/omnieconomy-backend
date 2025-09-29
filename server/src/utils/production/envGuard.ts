import path from "path";
import { fileURLToPath } from "url";
import logger from "../../logger";

/**
 * @param fn Code block to run in production.
 * @returns void
 */
export function runOnlyInProduction(fn: () => void): void {
  if (process.env.NODE_ENV !== "production") {
    const relPath = getCallerRelativePath();
    logger.info("🛑 Skipped production-only code from:", relPath);
    return;
  }
  fn();
}

/**
 * @param fn Code block to run in development.
 * @returns void
 */
export function runOnlyInDevelopment(fn: () => void): void {
  if (process.env.NODE_ENV === "production") {
    const relPath = getCallerRelativePath();
    logger.info("🛑 Skipped development-only code from:", relPath);
    return;
  }
  fn();
}

/**
 * @returns True if running in production, otherwise false.
 */
export function exitIfNotProduction(): boolean {
  if (process.env.NODE_ENV !== "production") {
    const relPath = getCallerRelativePath();
    logger.info("🛑 Skipped production-only module from:", relPath);
    return false;
  }
  return true;
}

/**
 * @returns Clean relative path of the caller".
 */
function getCallerRelativePath(): string {
  const stack = new Error().stack;
  const stackLines = stack?.split("\n") ?? [];
  const callerLine = stackLines[3] ?? "";

  const match =
    callerLine.match(/\((.*):\d+:\d+\)$/) ??
    callerLine.match(/at (.*):\d+:\d+$/);

  let fullPath = match?.[1];
  if (!fullPath) return "unknown";

  if (fullPath.startsWith("file://")) {
    fullPath = fileURLToPath(fullPath);
  } else {
    fullPath = decodeURIComponent(fullPath);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, "../../..");

  const relativePath = path.relative(projectRoot, fullPath);
  const parsed = path.parse(relativePath);

  return path.join(parsed.dir, parsed.name).replaceAll("\\", "/");
}
