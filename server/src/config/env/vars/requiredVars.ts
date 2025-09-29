export const REQUIRED_VARS = [
  "COOKIE_SECRET",
  "NODE_ENV",
  "PORT",
] as const;

export type RequiredEnvVar = typeof REQUIRED_VARS[number];
