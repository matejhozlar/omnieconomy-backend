import type { JwtPayload } from "jsonwebtoken";

export interface AuthPayload extends JwtPayload {
  uuid: string;
  name: string;
}
