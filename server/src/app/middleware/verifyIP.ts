import { Request, Response, NextFunction } from "express";
import logger from "../../logger.js";

const allowedIp = process.env.ALLOWED_IP_ADDRESS;
const allowedIpLocal = process.env.ALLOWED_IP_ADDRESS_LOCAL;

/**
 * Express middleware to verify the IP address of incoming requests.
 *
 * - In production: only allows ALLOWED_IP_ADDRESS.
 * - In non-production: allows ALLOWED_IP_ADDRESS and ALLOWED_IP_ADDRESS_LOCAL.
 */
export default function verifyIP(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const rawIp =
    (req.headers["x-forwarded-for"] as string | undefined) ||
    req.connection.remoteAddress ||
    "";

  const normalizedIp = rawIp.replace("::ffff:", "").split(",")[0].trim();

  const isProd = process.env.NODE_ENV === "production";
  const allowed = isProd ? [allowedIp] : [allowedIp, allowedIpLocal];

  if (allowed.includes(normalizedIp)) {
    return next();
  }

  logger.warn(`Blocked request from IP: ${normalizedIp}`);
  res.status(403).json({ error: "Forbidden: Your IP is not allowed." });
}
