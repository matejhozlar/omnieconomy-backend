import { Router } from "express";
import type { Pool } from "pg";
import verifyIP from "../../middleware/verifyIP";
import verifyJWT from "../../middleware/verifyJWT";

import registerLogin from "./login.post";
import registerBalance from "./balance.get";
import registerDeposit from "./deposit.post";
import registerWithdraw from "./withdraw.post";
import registerTop from "./top.get";
import registerDaily from "./daily.post";
import registerServerRegister from "./server-register.post";

export interface Deps {
  db: Pool;
}

export default function modRouter(deps: Deps) {
  const router = Router();

  registerServerRegister(router, deps);
  registerLogin(router, deps);

  const protectedRouter = Router();
  protectedRouter.use(verifyIP, verifyJWT);

  registerBalance(protectedRouter, deps);
  registerDeposit(protectedRouter, deps);
  registerWithdraw(protectedRouter, deps);
  registerTop(protectedRouter, deps);
  registerDaily(protectedRouter, deps);

  router.use(protectedRouter);

  return router;
}
