import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  GARMIN_TOKEN_KEY: z.string().length(64),
  CRON_SECRET: z.string().min(32),
  TZ_DISPLAY: z.string().default("Europe/Berlin"),
});

export const env = schema.parse(process.env);
