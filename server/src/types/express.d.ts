import type { AuthPayload } from "./auth";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthPayload;
  }
}
