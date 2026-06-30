import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install",
  functions: {
    "api/py/*.py": { runtime: "python3.13", memory: 1024, maxDuration: 300 },
  },
  crons: [{ path: "/api/ingest/sync?mode=daily", schedule: "0 7 * * *" }], // 07:00 UTC — 09:00 Berlin in summer (CEST), 08:00 in winter (CET); Vercel cron is UTC only
};
