import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Deps } from "./index";

interface LoginBody {
  uuid?: string;
  name?: string;
}
interface LoginRes {
  token?: string;
  error?: string;
}

export default function registerLogin(router: Router, _deps: Deps) {
  router.post(
    "/currency/login",
    (req: Request<{}, LoginRes, LoginBody>, res: Response<LoginRes>) => {
      const { uuid, name } = req.body;
      if (!uuid || !name)
        return res.status(400).json({ error: "Missing uuid or name" });

      try {
        const token = jwt.sign(
          { uuid, name },
          process.env.JWT_SECRET as string,
          { expiresIn: "10m" }
        );
        return res.json({ token });
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}
