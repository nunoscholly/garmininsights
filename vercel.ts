import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install",
  functions: {
    // Python runtime is auto-detected for api/**/*.py; version comes from pyproject.toml (requires-python).
    // The `runtime` field is only for community runtimes (name@version) and breaks the deploy if set here.
    "api/py/*.py": { memory: 1024, maxDuration: 300 },
  },
  crons: [{ path: "/api/ingest/sync?mode=daily", schedule: "0 7 * * *" }], // 07:00 UTC — 09:00 Berlin in summer (CEST), 08:00 in winter (CET); Vercel cron is UTC only
};
