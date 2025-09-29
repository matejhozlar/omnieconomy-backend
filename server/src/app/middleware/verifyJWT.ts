// src/app/middleware/verifyJWT.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "../../types/auth";

/**
 * Express middleware to verify JWT tokens from the Authorization header.
 *
 * - Expects `Authorization: Bearer <token>` format.
 * - Verifies the token using `JWT_SECRET`.
 * - Attaches the decoded payload to `req.user` if valid.
 */
export default function verifyJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Invalid Authorization format" });
    return;
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}
