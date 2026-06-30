import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  GARMIN_TOKEN_KEY: z.string().length(64),
  ALLOWED_EMAIL: z.string().email().default("nunoscholly@gmail.com"),
  TZ_DISPLAY: z.string().default("Europe/Berlin"),
});

export const env = schema.parse(process.env);
