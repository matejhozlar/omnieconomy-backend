import { Router } from "express";
import type { Pool } from "pg";
import verifyIP from "../../middleware/verifyIP";
import verifyJWT from "../../middleware/verifyJWT";

import loginRouter from "./login.post";
import balanceRouter from "./balance.get";

export interface Deps {
  db: Pool;
}

export default function modRouter(deps: Deps) {
  const router = Router();

  loginRouter(router, deps);

  const protectedRouter = Router();
  protectedRouter.use(verifyIP, verifyJWT);

  balanceRouter(protectedRouter, deps);

  router.use(protectedRouter);

  return router;
}
