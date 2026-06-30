# Garmin Personal Analytics Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Whoop-style web dashboard on top of Garmin Connect data (Forerunner 945), deployed on Vercel, with four hero views (Today / Training / Sleep / Wellness).

**Architecture:** Next.js 16 (App Router, TS) frontend on Vercel reading from Neon Postgres. Python 3.13 Vercel Functions ingest data from Garmin Connect via `garth` on a daily cron + manual "Sync now" trigger. Single-user auth via Clerk.

**Tech Stack:**
- Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, Framer Motion
- Drizzle ORM + Drizzle Kit
- Neon Postgres (Vercel Marketplace)
- Clerk (single-user email allowlist)
- Python 3.13, `garth`, Vercel Python Functions (Fluid Compute)
- `pnpm` package manager, `vercel.ts` for project config

## Global Constraints

- All currency / cost choices target **Vercel Hobby + Neon free + Clerk free** = $0/mo.
- Single user only; access is restricted to `nunoscholly@gmail.com` via Clerk allowlist.
- All datetimes stored in UTC, rendered in `Europe/Berlin`.
- All Garmin raw payloads preserved verbatim in `raw_summary` jsonb columns — never mutated.
- No custom Recovery/Strain scores in v1; use Garmin's native fields (`sleep_score`, `body_battery_*`, `training_status`, `training_load`, `recovery_time_hours`).
- garth OAuth tokens encrypted at rest in Postgres (pgcrypto + `GARMIN_TOKEN_KEY` env var).
- Manual "Sync now" button in UI is the primary refresh mechanism (Hobby tier caps crons at once-per-day).
- All UI server components by default; client components only where interaction or animation requires it.
- Visual style: dark ink-black background, neon accents, one color per metric (Body Battery=lime, Sleep=cyan, Training=magenta, Wellness=warm white).

---

## File Structure (locked in here)

```
garmininsights/
├── app/                                    Next.js 16 App Router
│   ├── layout.tsx                          root layout, fonts, ClerkProvider, dark theme
│   ├── globals.css                         Tailwind v4 + theme tokens
│   ├── page.tsx                            redirects to /today
│   ├── today/page.tsx                      Today dashboard
│   ├── training/page.tsx                   Training overview
│   ├── training/[activityId]/page.tsx      Activity detail
│   ├── sleep/page.tsx                      Sleep dashboard
│   ├── wellness/page.tsx                   Wellness dashboard
│   └── api/
│       └── ingest/
│           ├── sync/route.ts               POST: triggers Python /api/py/ingest
│           └── status/route.ts             GET: latest ingest_run row for "last sync" indicator
├── api/                                    Vercel Python Functions (sibling to app/)
│   └── py/
│       ├── ingest.py                       main ingest handler (called by cron + UI sync button)
│       ├── _garth_client.py                garth wrapper: load tokens, refresh, expose typed methods
│       ├── _persist.py                     write helpers: upsert each table
│       └── _crypto.py                      pgcrypto helpers for token encrypt/decrypt
├── components/
│   ├── ui/                                 shadcn-installed primitives (button, card, etc.)
│   ├── charts/
│   │   ├── body-battery-curve.tsx          area chart
│   │   ├── sleep-stages-bar.tsx            stacked bar
│   │   ├── weekly-load-bar.tsx             bar chart
│   │   ├── trend-line.tsx                  generic trend with 30d baseline shading
│   │   └── consistency-heatmap.tsx         bedtime heatmap
│   ├── cards/
│   │   ├── hero-number.tsx                 huge animated number with label
│   │   ├── metric-card.tsx                 reusable card frame
│   │   ├── status-pill.tsx                 colored pill (training status, etc.)
│   │   └── sync-button.tsx                 client component, triggers /api/ingest/sync
│   ├── nav/
│   │   └── side-nav.tsx                    persistent sidebar with 4 dest links
│   └── theme/
│       └── metric-colors.ts                lime/cyan/magenta/warm-white tokens
├── db/
│   ├── schema.ts                           Drizzle table definitions
│   ├── index.ts                            Drizzle client (Neon HTTP driver)
│   └── queries/
│       ├── today.ts                        getTodayData()
│       ├── training.ts                     getTrainingOverview(), getActivity(id)
│       ├── sleep.ts                        getSleepOverview()
│       └── wellness.ts                     getWellnessOverview()
├── lib/
│   ├── env.ts                              typed env validator (zod)
│   ├── dates.ts                            UTC↔Berlin helpers (date-fns-tz)
│   └── format.ts                           formatMinutes, formatPace, etc.
├── scripts/
│   └── bootstrap_garmin.py                 interactive CLI: garth login → write encrypted tokens to DB
├── drizzle/                                drizzle-kit generated migrations
├── tests/
│   ├── lib/                                vitest unit tests for utilities
│   ├── db/                                 drizzle-kit type check via pnpm tsc
│   └── py/
│       ├── test_persist.py                 pytest: raw Garmin JSON → row shape
│       └── fixtures/                       recorded garth responses (sanitized)
├── vercel.ts                               project config (build, crons, Python runtime)
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── pyproject.toml                          Python deps (garth, psycopg, cryptography)
├── tsconfig.json
└── .env.example
```

---

## Phase 1 — Foundation

### Task 1: Scaffold Next.js + Tailwind + shadcn

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/ui/.gitkeep`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces: a working `pnpm dev` that serves `localhost:3000` with the dark theme + shadcn primitives ready to install.

- [ ] **Step 1: Init Next.js 16 with TypeScript + Tailwind + App Router**

```bash
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --eslint --app \
  --src-dir=false --import-alias="@/*" --use-pnpm \
  --turbopack --no-git
```

Accept all defaults for any remaining prompts.

- [ ] **Step 2: Init shadcn**

```bash
pnpm dlx shadcn@latest init -d -y
```

- [ ] **Step 3: Install Tailwind v4 + plugins for dark theme**

```bash
pnpm add -D tailwindcss@latest @tailwindcss/postcss postcss
```

Replace `app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --color-ink: #050505;
  --color-ink-2: #0c0c0e;
  --color-ink-3: #16161a;
  --color-fg: #f3f3f5;
  --color-fg-dim: #9a9aa3;
  --color-lime: #b6ff39;     /* body battery */
  --color-cyan: #5cf2ff;     /* sleep */
  --color-magenta: #ff4dd2;  /* training */
  --color-warm: #f5e6c8;     /* wellness */
  --color-amber: #ffb84d;
  --color-red: #ff5a5a;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Space Grotesk", system-ui, sans-serif;
}

html, body {
  background: var(--color-ink);
  color: var(--color-fg);
}
```

- [ ] **Step 4: Write `app/layout.tsx` with dark theme + fonts**

```tsx
import "./globals.css";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata = { title: "Garmin Insights" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} dark`}>
      <body className="min-h-screen bg-ink text-fg antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Replace `app/page.tsx` with redirect to `/today`**

```tsx
import { redirect } from "next/navigation";
export default function Home() { redirect("/today"); }
```

- [ ] **Step 6: Verify**

```bash
pnpm dev
```

Open `http://localhost:3000`, confirm dark background + redirect to `/today` (will 404 until Task 11 — acceptable).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 16 + Tailwind v4 + shadcn with dark theme"
```

---

### Task 2: Provision Neon, Clerk, env vars, vercel.ts

**Files:**
- Create: `vercel.ts`, `lib/env.ts`, `.env.local` (gitignored), update `.env.example`

**Interfaces:**
- Produces: validated `env` object importable as `import { env } from "@/lib/env"`. `vercel.ts` declares the Python runtime + initial cron config.

- [ ] **Step 1: Install Vercel CLI globally (user does this)**

Tell user:

```bash
npm i -g vercel
```

Then in repo:

```bash
vercel link
```

(creates `.vercel/project.json` — gitignored already)

- [ ] **Step 2: Provision Neon via Marketplace**

```bash
vercel integration add neon
```

Follow prompts → select "Free" plan → attach to this project. Confirms `DATABASE_URL` is now set in Vercel env.

- [ ] **Step 3: Provision Clerk via Marketplace**

```bash
vercel integration add clerk
```

Follow prompts → free plan. Confirms `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set.

- [ ] **Step 4: Generate token encryption key + add to Vercel env**

```bash
openssl rand -hex 32 | vercel env add GARMIN_TOKEN_KEY production
openssl rand -hex 32 | vercel env add GARMIN_TOKEN_KEY preview
openssl rand -hex 32 | vercel env add GARMIN_TOKEN_KEY development
```

- [ ] **Step 5: Pull env locally**

```bash
vercel env pull .env.local
```

- [ ] **Step 6: Write `lib/env.ts` (typed env validation)**

```bash
pnpm add zod
```

```ts
// lib/env.ts
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
```

- [ ] **Step 7: Write `vercel.ts`**

```bash
pnpm add -D @vercel/config
```

```ts
// vercel.ts
import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install",
  functions: {
    "api/py/*.py": { runtime: "python3.13", memory: 1024, maxDuration: 300 },
  },
  crons: [{ path: "/api/ingest/sync?mode=daily", schedule: "0 7 * * *" }], // 07:00 UTC = 09:00 Berlin
};
```

- [ ] **Step 8: Commit**

```bash
git add vercel.ts lib/env.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: provision Neon + Clerk, typed env, vercel.ts config"
```

---

### Task 3: Drizzle schema + first migration

**Files:**
- Create: `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`, `drizzle/0000_init.sql`

**Interfaces:**
- Produces: `db` client importable as `import { db } from "@/db"`, all tables typed and migrated.

- [ ] **Step 1: Install Drizzle + Neon driver**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Write `drizzle.config.ts`**

```ts
import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

- [ ] **Step 3: Write `db/schema.ts` (all tables from spec)**

```ts
// db/schema.ts
import {
  pgTable, serial, text, timestamp, integer, real, jsonb, date, boolean, primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const garminCredentials = pgTable("garmin_credentials", {
  userId: integer("user_id").references(() => users.id).primaryKey(),
  encryptedTokens: text("encrypted_tokens").notNull(), // pgcrypto-encrypted garth token JSON
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }).notNull(),
});

export const activities = pgTable("activities", {
  id: text("id").primaryKey(), // garmin activity id
  userId: integer("user_id").references(() => users.id).notNull(),
  startTs: timestamp("start_ts", { withTimezone: true }).notNull(),
  type: text("type").notNull(),
  durationSec: integer("duration_sec").notNull(),
  distanceM: real("distance_m"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  calories: integer("calories"),
  trainingEffectAerobic: real("training_effect_aerobic"),
  trainingEffectAnaerobic: real("training_effect_anaerobic"),
  trainingLoad: real("training_load"),
  vo2MaxAtTime: real("vo2_max_at_time"),
  rawSummary: jsonb("raw_summary").notNull(),
});

export const activitySamples = pgTable("activity_samples", {
  activityId: text("activity_id").references(() => activities.id).primaryKey(),
  samples: jsonb("samples").notNull(), // { ts: number[], hr: number[], pace: number[], ... }
});

export const dailyWellness = pgTable("daily_wellness", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  rhr: integer("rhr"),
  maxHr: integer("max_hr"),
  bodyBatteryMin: integer("body_battery_min"),
  bodyBatteryMax: integer("body_battery_max"),
  bodyBatteryWake: integer("body_battery_wake"),
  bodyBatterySleep: integer("body_battery_sleep"),
  bodyBatteryCurve: jsonb("body_battery_curve"),
  stressAvg: integer("stress_avg"),
  stressCurve: jsonb("stress_curve"),
  steps: integer("steps"),
  caloriesTotal: integer("calories_total"),
  caloriesActive: integer("calories_active"),
  intensityMinutesMod: integer("intensity_minutes_mod"),
  intensityMinutesVig: integer("intensity_minutes_vig"),
  floors: integer("floors"),
  spo2Avg: integer("spo2_avg"),
});

export const sleepSessions = pgTable("sleep_sessions", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  startTs: timestamp("start_ts", { withTimezone: true }).notNull(),
  endTs: timestamp("end_ts", { withTimezone: true }).notNull(),
  durationTotalSec: integer("duration_total_sec").notNull(),
  durationDeepSec: integer("duration_deep_sec"),
  durationLightSec: integer("duration_light_sec"),
  durationRemSec: integer("duration_rem_sec"),
  durationAwakeSec: integer("duration_awake_sec"),
  awakeningsCount: integer("awakenings_count"),
  avgHr: integer("avg_hr"),
  avgRespRate: real("avg_resp_rate"),
  avgSpo2: integer("avg_spo2"),
  garminSleepScore: integer("garmin_sleep_score"),
  rawSummary: jsonb("raw_summary").notNull(),
});

export const trainingStatus = pgTable("training_status", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: text("status"), // "productive", "maintaining", "strained", etc.
  acuteLoad: real("acute_load"),
  chronicLoad: real("chronic_load"),
  vo2Max: real("vo2_max"),
  recoveryTimeHours: integer("recovery_time_hours"),
  racePredictor: jsonb("race_predictor"),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  errors: jsonb("errors"),
  mode: text("mode"), // "daily" | "manual"
});

// Reserved for v2 (created so migrations don't churn later)
export const dailyScores = pgTable("daily_scores", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  recoveryPct: integer("recovery_pct"),
  strainScore: real("strain_score"),
  sleepScore: integer("sleep_score"),
  components: jsonb("components"),
});

export const journalEntries = pgTable("journal_entries", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  payload: jsonb("payload"),
  notes: text("notes"),
});
```

- [ ] **Step 4: Write `db/index.ts`**

```ts
// db/index.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
export * from "./schema";
```

- [ ] **Step 5: Enable pgcrypto + generate migration**

Manually edit the soon-to-be-generated migration to prepend the pgcrypto extension. First:

```bash
pnpm drizzle-kit generate
```

Then open `drizzle/0000_*.sql` and add as the first line:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

- [ ] **Step 6: Apply migration**

```bash
pnpm drizzle-kit migrate
```

Expected output: `0000_init applied`.

- [ ] **Step 7: Quick smoke test**

Create `scripts/db_smoke.ts`:

```ts
import { db, users } from "@/db";
const rows = await db.select().from(users);
console.log("users count:", rows.length); // expect 0
```

Run:

```bash
pnpm tsx scripts/db_smoke.ts
```

Expected: `users count: 0`. Delete file after confirming.

- [ ] **Step 8: Commit**

```bash
git add db/ drizzle/ drizzle.config.ts package.json pnpm-lock.yaml
git commit -m "feat: drizzle schema + initial migration"
```

---

## Phase 2 — Python ingestion

### Task 4: Python function scaffolding + hello test

**Files:**
- Create: `pyproject.toml`, `api/py/ingest.py`, `tests/py/test_smoke.py`

**Interfaces:**
- Produces: `GET /api/py/ingest` returns `{"ok": true}` when run via `vercel dev`.

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "garmininsights-ingest"
version = "0.0.1"
requires-python = ">=3.13"
dependencies = [
  "garth>=0.4.46",
  "psycopg[binary]>=3.2",
  "cryptography>=43.0",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.24"]
```

- [ ] **Step 2: Stub `api/py/ingest.py`**

```python
# api/py/ingest.py
from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True}).encode())
```

- [ ] **Step 3: Test locally via `vercel dev`**

```bash
vercel dev
```

In another terminal:

```bash
curl http://localhost:3000/api/py/ingest
```

Expected: `{"ok": true}`.

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml api/py/
git commit -m "feat: Python function scaffolding with smoke endpoint"
```

---

### Task 5: garth bootstrap CLI script

**Files:**
- Create: `scripts/bootstrap_garmin.py`, `api/py/_crypto.py`

**Interfaces:**
- Produces: a one-time CLI you run locally to log into Garmin and persist encrypted OAuth tokens into Postgres for user_id 1.

- [ ] **Step 1: Write `api/py/_crypto.py`**

```python
# api/py/_crypto.py
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def _key() -> bytes:
    return bytes.fromhex(os.environ["GARMIN_TOKEN_KEY"])

def encrypt(plaintext: str) -> str:
    aes = AESGCM(_key())
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()

def decrypt(ciphertext: str) -> str:
    raw = base64.b64decode(ciphertext)
    nonce, ct = raw[:12], raw[12:]
    aes = AESGCM(_key())
    return aes.decrypt(nonce, ct, None).decode()
```

- [ ] **Step 2: Write `scripts/bootstrap_garmin.py`**

```python
# scripts/bootstrap_garmin.py
"""
Run locally once:
  GARMIN_TOKEN_KEY=... DATABASE_URL=... python scripts/bootstrap_garmin.py

Prompts for Garmin email/password (MFA if enabled), then writes encrypted
tokens to garmin_credentials for user_id=1. Creates the user row if absent.
"""
import os
import sys
import json
import getpass
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api", "py"))
import garth
import psycopg
from _crypto import encrypt

EMAIL_DEFAULT = "nunoscholly@gmail.com"

def main():
    email = input(f"Garmin email [{EMAIL_DEFAULT}]: ").strip() or EMAIL_DEFAULT
    password = getpass.getpass("Garmin password: ")
    try:
        garth.login(email, password)
    except garth.exc.GarthHTTPError as e:
        if "mfa" in str(e).lower():
            code = input("MFA code: ").strip()
            garth.login(email, password, prompt_mfa=lambda: code)
        else:
            raise

    tokens_dict = {
        "oauth1": garth.client.oauth1_token.__dict__,
        "oauth2": garth.client.oauth2_token.__dict__,
    }
    encrypted = encrypt(json.dumps(tokens_dict, default=str))

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (clerk_id, email) VALUES (%s, %s) "
                "ON CONFLICT (clerk_id) DO NOTHING RETURNING id;",
                ("pending-clerk-link", email),
            )
            row = cur.fetchone()
            if row:
                user_id = row[0]
            else:
                cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
                user_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO garmin_credentials (user_id, encrypted_tokens, last_refreshed_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                  encrypted_tokens = EXCLUDED.encrypted_tokens,
                  last_refreshed_at = EXCLUDED.last_refreshed_at;
                """,
                (user_id, encrypted, datetime.now(timezone.utc)),
            )
        conn.commit()

    print(f"OK: wrote tokens for user_id={user_id}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Install Python deps locally + run**

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e .
python scripts/bootstrap_garmin.py
```

Expected: prompts for credentials, prints `OK: wrote tokens for user_id=1`.

- [ ] **Step 4: Verify in DB**

```bash
pnpm tsx -e "import {db, garminCredentials} from '@/db'; console.log(await db.select().from(garminCredentials))"
```

Expected: one row with `encryptedTokens` not null.

- [ ] **Step 5: Commit (exclude any local pip caches)**

```bash
echo ".venv/" >> .gitignore
git add scripts/bootstrap_garmin.py api/py/_crypto.py .gitignore
git commit -m "feat: garth bootstrap CLI with encrypted token storage"
```

---

### Task 6: garth client wrapper (load + refresh)

**Files:**
- Create: `api/py/_garth_client.py`
- Test: `tests/py/test_garth_client.py`

**Interfaces:**
- Produces:
  - `load_client(user_id: int) -> garth.Client` — loads + decrypts tokens, returns ready-to-call garth client.
  - `persist_tokens(user_id: int, client: garth.Client) -> None` — writes (possibly refreshed) tokens back.

- [ ] **Step 1: Write `api/py/_garth_client.py`**

```python
# api/py/_garth_client.py
import os
import json
from datetime import datetime, timezone
import psycopg
import garth
from _crypto import encrypt, decrypt

def _db():
    return psycopg.connect(os.environ["DATABASE_URL"])

def load_client(user_id: int) -> garth.Client:
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT encrypted_tokens FROM garmin_credentials WHERE user_id = %s;",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"No garmin_credentials for user_id={user_id}")
        tokens = json.loads(decrypt(row[0]))

    client = garth.Client()
    client.configure(
        oauth1_token=garth.auth_tokens.OAuth1Token(**tokens["oauth1"]),
        oauth2_token=garth.auth_tokens.OAuth2Token(**tokens["oauth2"]),
    )
    if client.oauth2_token.expired:
        client.refresh_oauth2()
        persist_tokens(user_id, client)
    return client

def persist_tokens(user_id: int, client: garth.Client) -> None:
    tokens = {
        "oauth1": client.oauth1_token.__dict__,
        "oauth2": client.oauth2_token.__dict__,
    }
    encrypted = encrypt(json.dumps(tokens, default=str))
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE garmin_credentials
            SET encrypted_tokens = %s, last_refreshed_at = %s
            WHERE user_id = %s;
            """,
            (encrypted, datetime.now(timezone.utc), user_id),
        )
        conn.commit()
```

- [ ] **Step 2: Test it loads against real DB**

Create `scripts/test_garth.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api", "py"))
from _garth_client import load_client

c = load_client(1)
print("RHR today:", c.connectapi(
    f"/wellness-service/wellness/dailyHeartRate/me?date={__import__('datetime').date.today()}"
))
```

```bash
source .venv/bin/activate
python scripts/test_garth.py
```

Expected: a JSON response with HR data printed. Delete script after.

- [ ] **Step 3: Commit**

```bash
git add api/py/_garth_client.py
git commit -m "feat: garth client wrapper with auto token refresh"
```

---

### Task 7: Persist helpers + daily ingestion

**Files:**
- Create: `api/py/_persist.py`, update `api/py/ingest.py`
- Test: `tests/py/test_persist.py`, `tests/py/fixtures/sleep_2026-06-29.json`, `tests/py/fixtures/daily_wellness_2026-06-29.json`, `tests/py/fixtures/training_status_2026-06-29.json`

**Interfaces:**
- Produces:
  - `persist_daily_wellness(user_id: int, date: str, payload: dict) -> None`
  - `persist_sleep(user_id: int, date: str, payload: dict) -> None`
  - `persist_training_status(user_id: int, date: str, payload: dict) -> None`
- Each is idempotent: re-running for same date overwrites.

- [ ] **Step 1: Record real fixtures**

Run a one-off script (delete after) that hits the live garth client, saves three JSON files into `tests/py/fixtures/` with sensitive fields (`userId`, `displayName`, `email`) redacted.

- [ ] **Step 2: Write `tests/py/test_persist.py`**

```python
# tests/py/test_persist.py
import json
from pathlib import Path
import pytest
from api.py import _persist  # adjust sys.path in conftest

FIX = Path(__file__).parent / "fixtures"

def load(name): return json.loads((FIX / name).read_text())

def test_daily_wellness_shape():
    row = _persist.shape_daily_wellness(
        user_id=1, date="2026-06-29",
        payload=load("daily_wellness_2026-06-29.json"),
    )
    assert row["date"] == "2026-06-29"
    assert isinstance(row["rhr"], int)
    assert isinstance(row["steps"], int)
    assert row["body_battery_curve"] is not None

def test_sleep_shape():
    row = _persist.shape_sleep(
        user_id=1, date="2026-06-29",
        payload=load("sleep_2026-06-29.json"),
    )
    assert row["duration_total_sec"] > 0
    assert row["garmin_sleep_score"] is None or 0 <= row["garmin_sleep_score"] <= 100

def test_training_status_shape():
    row = _persist.shape_training_status(
        user_id=1, date="2026-06-29",
        payload=load("training_status_2026-06-29.json"),
    )
    assert row["status"] in {"productive", "maintaining", "strained", "peaking", "detraining", "unproductive", "overreaching", "recovery", None}
```

- [ ] **Step 3: Run test — expect FAIL (no `_persist` module yet)**

```bash
source .venv/bin/activate
pytest tests/py/test_persist.py -v
```

Expected: import error.

- [ ] **Step 4: Write `api/py/_persist.py`**

```python
# api/py/_persist.py
import os
import json
import psycopg

def _db():
    return psycopg.connect(os.environ["DATABASE_URL"])

# ---------- shapers (pure functions, easy to test) ----------

def shape_daily_wellness(user_id: int, date: str, payload: dict) -> dict:
    return {
        "user_id": user_id,
        "date": date,
        "rhr": payload.get("restingHeartRate"),
        "max_hr": payload.get("maxHeartRate"),
        "body_battery_min": payload.get("bodyBatteryLowestValue"),
        "body_battery_max": payload.get("bodyBatteryHighestValue"),
        "body_battery_wake": payload.get("bodyBatteryAtWakeTime"),
        "body_battery_sleep": payload.get("bodyBatteryDuringSleep"),
        "body_battery_curve": payload.get("bodyBatteryValuesArray"),
        "stress_avg": payload.get("averageStressLevel"),
        "stress_curve": payload.get("stressValuesArray"),
        "steps": payload.get("totalSteps"),
        "calories_total": payload.get("totalKilocalories"),
        "calories_active": payload.get("activeKilocalories"),
        "intensity_minutes_mod": payload.get("moderateIntensityMinutes"),
        "intensity_minutes_vig": payload.get("vigorousIntensityMinutes"),
        "floors": payload.get("floorsAscended"),
        "spo2_avg": payload.get("averageSpo2"),
    }

def shape_sleep(user_id: int, date: str, payload: dict) -> dict:
    s = payload.get("dailySleepDTO", payload)
    return {
        "user_id": user_id,
        "date": date,
        "start_ts": s.get("sleepStartTimestampGMT"),
        "end_ts": s.get("sleepEndTimestampGMT"),
        "duration_total_sec": s.get("sleepTimeSeconds") or 0,
        "duration_deep_sec": s.get("deepSleepSeconds"),
        "duration_light_sec": s.get("lightSleepSeconds"),
        "duration_rem_sec": s.get("remSleepSeconds"),
        "duration_awake_sec": s.get("awakeSleepSeconds"),
        "awakenings_count": s.get("awakeCount"),
        "avg_hr": s.get("averageSleepHR"),
        "avg_resp_rate": s.get("averageRespirationValue"),
        "avg_spo2": s.get("averageSpO2Value"),
        "garmin_sleep_score": (s.get("sleepScores") or {}).get("overall", {}).get("value"),
        "raw_summary": payload,
    }

def shape_training_status(user_id: int, date: str, payload: dict) -> dict:
    return {
        "user_id": user_id,
        "date": date,
        "status": (payload.get("trainingStatus") or {}).get("statusKey"),
        "acute_load": (payload.get("acwr") or {}).get("acuteLoad"),
        "chronic_load": (payload.get("acwr") or {}).get("chronicLoad"),
        "vo2_max": payload.get("vo2Max"),
        "recovery_time_hours": payload.get("recoveryTime"),
        "race_predictor": payload.get("racePredictor"),
    }

# ---------- upserters ----------

def persist_daily_wellness(user_id, date, payload):
    row = shape_daily_wellness(user_id, date, payload)
    _upsert("daily_wellness", row, conflict_col="date")

def persist_sleep(user_id, date, payload):
    row = shape_sleep(user_id, date, payload)
    _upsert("sleep_sessions", {**row, "raw_summary": json.dumps(row["raw_summary"])}, conflict_col="date")

def persist_training_status(user_id, date, payload):
    row = shape_training_status(user_id, date, payload)
    _upsert("training_status", row, conflict_col="date")

def _upsert(table: str, row: dict, conflict_col: str):
    cols = list(row.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != conflict_col)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_col}) DO UPDATE SET {updates};"
    )
    with _db() as conn, conn.cursor() as cur:
        cur.execute(sql, [row[c] for c in cols])
        conn.commit()
```

- [ ] **Step 5: Write `tests/py/conftest.py`**

```python
# tests/py/conftest.py
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api", "py"))
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
pytest tests/py -v
```

Expected: 3 PASS.

- [ ] **Step 7: Update `api/py/ingest.py` to do real ingestion**

```python
# api/py/ingest.py
import os, json, traceback
from datetime import date as Date, datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import psycopg
from _garth_client import load_client
from _persist import (
    persist_daily_wellness, persist_sleep, persist_training_status,
)

USER_ID = 1

def _record_run(mode: str, ok: bool, errors):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingest_runs (started_at, finished_at, ok, errors, mode) "
            "VALUES (%s, %s, %s, %s, %s);",
            (datetime.now(timezone.utc), datetime.now(timezone.utc), ok, json.dumps(errors), mode),
        )
        conn.commit()

def _ingest(mode: str):
    errors = []
    client = load_client(USER_ID)
    today = Date.today()
    targets = [today, today - timedelta(days=1)]  # always re-pull yesterday for late sleep data

    for d in targets:
        ds = d.isoformat()
        for name, path, persist in [
            ("wellness",
             f"/usersummary-service/usersummary/daily/{USER_ID}?calendarDate={ds}",
             persist_daily_wellness),
            ("sleep",
             f"/wellness-service/wellness/dailySleepData/me?date={ds}",
             persist_sleep),
            ("training_status",
             f"/metrics-service/metrics/trainingstatus/aggregated/{USER_ID}?...",
             persist_training_status),
        ]:
            try:
                payload = client.connectapi(path)
                persist(USER_ID, ds, payload)
            except Exception as e:
                errors.append({"date": ds, "endpoint": name, "error": str(e), "trace": traceback.format_exc()})

    _record_run(mode, ok=not errors, errors=errors or None)
    return {"ok": not errors, "errors": errors}

class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):  # used by cron (GET against /api/ingest/sync proxies here)
        mode = parse_qs(urlparse(self.path).query).get("mode", ["daily"])[0]
        self._send(200, _ingest(mode))

    def do_POST(self):  # used by UI sync button
        self._send(200, _ingest("manual"))
```

- [ ] **Step 8: Run `vercel dev` + manual end-to-end test**

```bash
vercel dev
curl -X POST http://localhost:3000/api/py/ingest
```

Expected: `{"ok": true, "errors": []}`. Verify via:

```bash
pnpm tsx -e "import {db, dailyWellness, sleepSessions, trainingStatus} from '@/db'; console.log({w: await db.select().from(dailyWellness), s: await db.select().from(sleepSessions), t: await db.select().from(trainingStatus)})"
```

Expected: rows for today + yesterday.

- [ ] **Step 9: Commit**

```bash
git add api/py/ tests/py/
git commit -m "feat: daily wellness + sleep + training_status ingestion with idempotent upserts"
```

---

### Task 8: Activity ingestion (summary + samples)

**Files:**
- Modify: `api/py/_persist.py`, `api/py/ingest.py`
- Test: `tests/py/test_persist.py`, add fixture `tests/py/fixtures/activity_summary.json`

**Interfaces:**
- Produces:
  - `persist_activity(user_id, payload) -> str` (returns activity id)
  - `persist_activity_samples(activity_id, samples_payload) -> None`
- `ingest()` now also pulls last 7 days of activities + samples for any not already in DB.

- [ ] **Step 1: Record fixture from one of your real activities**

Save as `tests/py/fixtures/activity_summary.json`.

- [ ] **Step 2: Add test**

```python
# append to tests/py/test_persist.py
def test_activity_shape():
    row = _persist.shape_activity(
        user_id=1,
        payload=load("activity_summary.json"),
    )
    assert row["id"]
    assert row["type"]
    assert row["duration_sec"] > 0
    assert row["avg_hr"] is None or 30 < row["avg_hr"] < 220
```

- [ ] **Step 3: Add shaper + upserter to `api/py/_persist.py`**

```python
def shape_activity(user_id: int, payload: dict) -> dict:
    a = payload
    return {
        "id": str(a["activityId"]),
        "user_id": user_id,
        "start_ts": a.get("startTimeGMT"),
        "type": (a.get("activityType") or {}).get("typeKey", "other"),
        "duration_sec": int(a.get("duration") or 0),
        "distance_m": a.get("distance"),
        "avg_hr": a.get("averageHR"),
        "max_hr": a.get("maxHR"),
        "calories": a.get("calories"),
        "training_effect_aerobic": a.get("aerobicTrainingEffect"),
        "training_effect_anaerobic": a.get("anaerobicTrainingEffect"),
        "training_load": a.get("activityTrainingLoad"),
        "vo2_max_at_time": a.get("vO2MaxValue"),
        "raw_summary": a,
    }

def persist_activity(user_id, payload) -> str:
    row = shape_activity(user_id, payload)
    row["raw_summary"] = json.dumps(row["raw_summary"])
    _upsert("activities", row, conflict_col="id")
    return row["id"]

def persist_activity_samples(activity_id: str, samples_payload: dict) -> None:
    _upsert("activity_samples",
            {"activity_id": activity_id, "samples": json.dumps(samples_payload)},
            conflict_col="activity_id")
```

- [ ] **Step 4: Run test, expect PASS**

```bash
pytest tests/py/test_persist.py::test_activity_shape -v
```

- [ ] **Step 5: Wire into `api/py/ingest.py`**

Add inside `_ingest`, after the daily loop:

```python
try:
    activities = client.connectapi(
        "/activitylist-service/activities/search/activities?start=0&limit=20"
    )
    for a in activities:
        aid = persist_activity(USER_ID, a)
        # samples (HR/pace/etc.)
        try:
            samples = client.connectapi(
                f"/activity-service/activity/{aid}/details?maxChartSize=2000&maxPolylineSize=4000"
            )
            persist_activity_samples(aid, samples)
        except Exception as e:
            errors.append({"activity_id": aid, "endpoint": "samples", "error": str(e)})
except Exception as e:
    errors.append({"endpoint": "activities_list", "error": str(e)})
```

Note: `persist_activity` is idempotent (upsert on id), so re-running is safe.

- [ ] **Step 6: End-to-end test**

```bash
vercel dev
curl -X POST http://localhost:3000/api/py/ingest
```

Verify activities present:

```bash
pnpm tsx -e "import {db, activities} from '@/db'; console.log((await db.select().from(activities)).map(a => ({id: a.id, type: a.type, start: a.startTs})))"
```

Expected: at least your most recent activity.

- [ ] **Step 7: Commit**

```bash
git add api/py/ tests/py/
git commit -m "feat: activity + samples ingestion"
```

---

### Task 9: Next.js sync routes + "last sync" status

**Files:**
- Create: `app/api/ingest/sync/route.ts`, `app/api/ingest/status/route.ts`
- Modify: `vercel.ts` (cron now points to the Next.js proxy)

**Interfaces:**
- Produces:
  - `POST /api/ingest/sync` — Next.js route that fetches `/api/py/ingest`. Used by the UI button.
  - `GET /api/ingest/status` — returns `{ lastRunAt: string | null, ok: boolean | null }`.

- [ ] **Step 1: Write `app/api/ingest/sync/route.ts`**

```ts
// app/api/ingest/sync/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "manual";
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${base}/api/py/ingest?mode=${mode}`, { method: "POST" });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export const GET = POST; // cron uses GET; behave the same
```

- [ ] **Step 2: Write `app/api/ingest/status/route.ts`**

```ts
// app/api/ingest/status/route.ts
import { NextResponse } from "next/server";
import { db, ingestRuns } from "@/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const [row] = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(1);
  return NextResponse.json({
    lastRunAt: row?.startedAt ?? null,
    ok: row?.ok ?? null,
    mode: row?.mode ?? null,
  });
}
```

- [ ] **Step 3: Update `vercel.ts` cron path**

Replace the existing cron entry:

```ts
crons: [{ path: "/api/ingest/sync?mode=daily", schedule: "0 7 * * *" }],
```

(No change needed — already points to the Next.js route. Verify.)

- [ ] **Step 4: E2E test**

```bash
vercel dev
curl -X POST http://localhost:3000/api/ingest/sync
curl http://localhost:3000/api/ingest/status
```

Expected: status returns recent `lastRunAt` and `ok: true`.

- [ ] **Step 5: Commit**

```bash
git add app/api/
git commit -m "feat: ingest sync + status routes for cron + UI"
```

---

## Phase 3 — UI

### Task 10: App shell — auth, layout, nav

**Files:**
- Create: `middleware.ts`, `components/nav/side-nav.tsx`, `components/cards/sync-button.tsx`, `components/theme/metric-colors.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: every page wrapped in Clerk auth + persistent left nav + top-right sync button + "last sync" indicator.

- [ ] **Step 1: Install Clerk**

```bash
pnpm add @clerk/nextjs
```

- [ ] **Step 2: Write `middleware.ts`**

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { env } from "@/lib/env";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/api/py/(.*)", "/api/ingest/sync(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { userId, sessionClaims } = await auth();
  if (!userId) return (await auth()).redirectToSignIn();
  const email = (sessionClaims as { email?: string })?.email;
  if (email !== env.ALLOWED_EMAIL) {
    return Response.redirect(new URL("/forbidden", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
```

- [ ] **Step 3: Write `components/theme/metric-colors.ts`**

```ts
export const metric = {
  bodyBattery: { fg: "text-lime", bg: "bg-lime/20", ring: "ring-lime/40", hex: "#b6ff39" },
  sleep:       { fg: "text-cyan", bg: "bg-cyan/20", ring: "ring-cyan/40", hex: "#5cf2ff" },
  training:    { fg: "text-magenta", bg: "bg-magenta/20", ring: "ring-magenta/40", hex: "#ff4dd2" },
  wellness:    { fg: "text-warm", bg: "bg-warm/20", ring: "ring-warm/40", hex: "#f5e6c8" },
} as const;
```

- [ ] **Step 4: Write `components/nav/side-nav.tsx`**

```tsx
// components/nav/side-nav.tsx
import Link from "next/link";

const links = [
  { href: "/today",    label: "Today",    color: "text-fg" },
  { href: "/training", label: "Training", color: "text-magenta" },
  { href: "/sleep",    label: "Sleep",    color: "text-cyan" },
  { href: "/wellness", label: "Wellness", color: "text-warm" },
];

export function SideNav() {
  return (
    <nav className="fixed inset-y-0 left-0 w-48 border-r border-ink-3 bg-ink-2 p-6 flex flex-col gap-1">
      <div className="font-display text-xl mb-8">garmininsights</div>
      {links.map(l => (
        <Link key={l.href} href={l.href}
          className={`px-3 py-2 rounded hover:bg-ink-3 ${l.color}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Write `components/cards/sync-button.tsx`**

```tsx
// components/cards/sync-button.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ lastRunAt, ok }: { lastRunAt: string | null; ok: boolean | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const since = lastRunAt ? new Date(lastRunAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "never";
  const dot = ok === null ? "bg-fg-dim" : ok ? "bg-lime" : "bg-red";

  async function onClick() {
    setBusy(true);
    await fetch("/api/ingest/sync", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-fg-dim">last sync: {since}</span>
      <span className={`inline-block size-2 rounded-full ${dot}`} />
      <button onClick={onClick} disabled={busy}
        className="px-3 py-1.5 rounded bg-ink-3 hover:bg-fg/10 disabled:opacity-50">
        {busy ? "syncing…" : "sync now"}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Update `app/layout.tsx`**

```tsx
import "./globals.css";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SideNav } from "@/components/nav/side-nav";
import { SyncButton } from "@/components/cards/sync-button";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata = { title: "Garmin Insights" };

async function getStatus() {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const r = await fetch(`${base}/api/ingest/status`, { cache: "no-store" });
  return r.json();
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await getStatus();
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${display.variable} dark`}>
        <body className="min-h-screen bg-ink text-fg antialiased">
          <SideNav />
          <main className="ml-48 p-8">
            <header className="flex justify-end mb-6">
              <SyncButton lastRunAt={status.lastRunAt} ok={status.ok} />
            </header>
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 7: Local verify**

```bash
pnpm dev
```

Sign in via Clerk (will redirect). Confirm: side nav visible, sync button works, last-sync indicator updates.

- [ ] **Step 8: Commit**

```bash
git add middleware.ts app/layout.tsx components/ package.json pnpm-lock.yaml
git commit -m "feat: app shell with Clerk auth + side nav + sync button"
```

---

### Task 11: Today page

**Files:**
- Create: `app/today/page.tsx`, `db/queries/today.ts`, `components/cards/hero-number.tsx`, `components/cards/metric-card.tsx`, `components/cards/status-pill.tsx`, `components/charts/body-battery-curve.tsx`, `components/charts/sleep-stages-bar.tsx`, `lib/dates.ts`, `lib/format.ts`

**Interfaces:**
- Produces: `/today` showing Body Battery curve + wake number, last night's Sleep Score + stages, Training Status + Recovery Time + today's Load, key stats (steps, calories, RHR, stress).

- [ ] **Step 1: Install Recharts + Framer Motion + date-fns**

```bash
pnpm add recharts framer-motion date-fns date-fns-tz
```

- [ ] **Step 2: Write `lib/dates.ts`**

```ts
import { formatInTimeZone } from "date-fns-tz";

export const TZ = "Europe/Berlin";
export const todayBerlin = () =>
  formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
export const yesterdayBerlin = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
};
```

- [ ] **Step 3: Write `lib/format.ts`**

```ts
export const fmtMin = (sec: number | null | undefined) => {
  if (!sec) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const fmtInt = (n: number | null | undefined) => n == null ? "–" : n.toLocaleString("de-DE");

export const fmtPace = (mPerS: number | null | undefined) => {
  if (!mPerS) return "–";
  const secPerKm = 1000 / mPerS;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60).toString().padStart(2, "0");
  return `${m}:${s} /km`;
};
```

- [ ] **Step 4: Write `db/queries/today.ts`**

```ts
import { db, dailyWellness, sleepSessions, trainingStatus, activities } from "@/db";
import { eq, desc } from "drizzle-orm";
import { todayBerlin, yesterdayBerlin } from "@/lib/dates";

export async function getTodayData() {
  const today = todayBerlin();
  const yesterday = yesterdayBerlin();

  const [w] = await db.select().from(dailyWellness).where(eq(dailyWellness.date, today)).limit(1);
  const [s] = await db.select().from(sleepSessions).where(eq(sleepSessions.date, yesterday)).limit(1);
  const [t] = await db.select().from(trainingStatus).where(eq(trainingStatus.date, today)).limit(1);
  const lastActivities = await db.select().from(activities).orderBy(desc(activities.startTs)).limit(3);

  return { w, s, t, lastActivities };
}
```

- [ ] **Step 5: Write hero/metric/pill components**

```tsx
// components/cards/hero-number.tsx
"use client";
import { motion } from "framer-motion";

export function HeroNumber({ value, label, color, suffix }: {
  value: string | number; label: string; color: string; suffix?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="space-y-1"
    >
      <div className={`font-display text-7xl tabular-nums ${color}`}>
        {value}{suffix && <span className="text-3xl ml-1 opacity-60">{suffix}</span>}
      </div>
      <div className="text-fg-dim uppercase tracking-widest text-xs">{label}</div>
    </motion.div>
  );
}
```

```tsx
// components/cards/metric-card.tsx
export function MetricCard({ title, children, accent }: {
  title: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-ink-2 border border-ink-3 p-6 space-y-3">
      <div className={`text-xs uppercase tracking-widest ${accent ?? "text-fg-dim"}`}>{title}</div>
      {children}
    </div>
  );
}
```

```tsx
// components/cards/status-pill.tsx
export function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-fg-dim">–</span>;
  const color = {
    productive: "bg-lime/20 text-lime",
    maintaining: "bg-warm/20 text-warm",
    recovery: "bg-cyan/20 text-cyan",
    strained: "bg-amber/20 text-amber",
    overreaching: "bg-red/20 text-red",
    unproductive: "bg-red/20 text-red",
  }[status] ?? "bg-fg/10 text-fg";
  return <span className={`px-3 py-1 rounded-full text-sm ${color}`}>{status}</span>;
}
```

- [ ] **Step 6: Write `components/charts/body-battery-curve.tsx`**

```tsx
"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export function BodyBatteryCurve({ curve }: { curve: number[][] | null }) {
  if (!curve?.length) return <div className="text-fg-dim text-sm">no data</div>;
  const data = curve.map(([ts, v]) => ({ ts, v }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="bb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b6ff39" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#b6ff39" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="ts" hide />
        <YAxis hide domain={[0, 100]} />
        <Tooltip contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a" }} />
        <Area dataKey="v" stroke="#b6ff39" strokeWidth={2} fill="url(#bb)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 7: Write `components/charts/sleep-stages-bar.tsx`**

```tsx
export function SleepStagesBar({ deep, light, rem, awake }: {
  deep: number; light: number; rem: number; awake: number;
}) {
  const total = deep + light + rem + awake || 1;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="h-3 flex rounded-full overflow-hidden bg-ink-3">
      <div style={{ width: `${pct(deep)}%`  }} className="bg-cyan" />
      <div style={{ width: `${pct(rem)}%`   }} className="bg-cyan/70" />
      <div style={{ width: `${pct(light)}%` }} className="bg-cyan/40" />
      <div style={{ width: `${pct(awake)}%` }} className="bg-fg-dim/60" />
    </div>
  );
}
```

- [ ] **Step 8: Write `app/today/page.tsx`**

```tsx
import { getTodayData } from "@/db/queries/today";
import { HeroNumber } from "@/components/cards/hero-number";
import { MetricCard } from "@/components/cards/metric-card";
import { StatusPill } from "@/components/cards/status-pill";
import { BodyBatteryCurve } from "@/components/charts/body-battery-curve";
import { SleepStagesBar } from "@/components/charts/sleep-stages-bar";
import { fmtInt, fmtMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { w, s, t } = await getTodayData();
  return (
    <div className="space-y-8 max-w-6xl">
      <div className="grid grid-cols-3 gap-6">
        <HeroNumber value={w?.bodyBatteryWake ?? "–"} label="Body Battery at wake" color="text-lime" />
        <HeroNumber value={s?.garminSleepScore ?? "–"} label="Sleep Score" color="text-cyan" />
        <HeroNumber value={t?.recoveryTimeHours ?? "–"} suffix="h" label="Recovery time" color="text-magenta" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <MetricCard title="Body Battery — today" accent="text-lime">
          <BodyBatteryCurve curve={w?.bodyBatteryCurve as number[][] | null} />
          <div className="flex justify-between text-fg-dim text-xs">
            <span>min {w?.bodyBatteryMin ?? "–"}</span>
            <span>max {w?.bodyBatteryMax ?? "–"}</span>
          </div>
        </MetricCard>

        <MetricCard title="Last night's sleep" accent="text-cyan">
          <div className="text-3xl font-display">{fmtMin(s?.durationTotalSec)}</div>
          <SleepStagesBar
            deep={s?.durationDeepSec ?? 0}
            light={s?.durationLightSec ?? 0}
            rem={s?.durationRemSec ?? 0}
            awake={s?.durationAwakeSec ?? 0}
          />
          <div className="flex justify-between text-fg-dim text-xs">
            <span>deep {fmtMin(s?.durationDeepSec)}</span>
            <span>rem {fmtMin(s?.durationRemSec)}</span>
            <span>light {fmtMin(s?.durationLightSec)}</span>
          </div>
        </MetricCard>

        <MetricCard title="Training" accent="text-magenta">
          <StatusPill status={t?.status ?? null} />
          <div className="flex gap-6 text-sm text-fg-dim mt-2">
            <span>acute load: {t?.acuteLoad?.toFixed(0) ?? "–"}</span>
            <span>chronic: {t?.chronicLoad?.toFixed(0) ?? "–"}</span>
            <span>VO₂max: {t?.vo2Max?.toFixed(1) ?? "–"}</span>
          </div>
        </MetricCard>

        <MetricCard title="Wellness today" accent="text-warm">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-fg-dim text-xs">Steps</div><div className="text-xl">{fmtInt(w?.steps)}</div></div>
            <div><div className="text-fg-dim text-xs">Calories</div><div className="text-xl">{fmtInt(w?.caloriesTotal)}</div></div>
            <div><div className="text-fg-dim text-xs">RHR</div><div className="text-xl">{w?.rhr ?? "–"}</div></div>
            <div><div className="text-fg-dim text-xs">Stress avg</div><div className="text-xl">{w?.stressAvg ?? "–"}</div></div>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Local verify**

```bash
pnpm dev
```

Visit `/today`. Confirm: hero numbers populated, body battery curve renders, sleep stages bar correct proportions, training status pill colored.

- [ ] **Step 10: Commit**

```bash
git add app/today/ db/queries/today.ts components/ lib/ package.json pnpm-lock.yaml
git commit -m "feat: Today dashboard with hero numbers + body battery + sleep + training cards"
```

---

### Task 12: Training page + activity detail

**Files:**
- Create: `app/training/page.tsx`, `app/training/[activityId]/page.tsx`, `db/queries/training.ts`, `components/charts/weekly-load-bar.tsx`, `components/charts/trend-line.tsx`

**Interfaces:**
- Produces:
  - `/training` shows weekly training load bar chart (last 8 weeks), training status timeline, VO2 max trend, activities table (clickable).
  - `/training/[id]` shows HR trace, splits if present, HR zone distribution, training effect breakdown.

- [ ] **Step 1: Write `db/queries/training.ts`**

```ts
import { db, activities, activitySamples, trainingStatus } from "@/db";
import { eq, desc, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function getTrainingOverview() {
  const since = new Date(); since.setDate(since.getDate() - 56); // 8 weeks
  const recentActivities = await db.select().from(activities)
    .where(gte(activities.startTs, since))
    .orderBy(desc(activities.startTs));
  const statusHistory = await db.select().from(trainingStatus)
    .where(gte(trainingStatus.date, since.toISOString().slice(0, 10)))
    .orderBy(trainingStatus.date);

  // weekly load aggregation
  const weeklyLoad = await db.execute<{ week: string; load: number }>(sql`
    SELECT to_char(date_trunc('week', start_ts), 'YYYY-MM-DD') AS week,
           COALESCE(SUM(training_load), 0)::float AS load
    FROM activities
    WHERE start_ts >= ${since.toISOString()}
    GROUP BY 1 ORDER BY 1;
  `);

  return { recentActivities, statusHistory, weeklyLoad: weeklyLoad.rows };
}

export async function getActivity(id: string) {
  const [a] = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  const [samples] = await db.select().from(activitySamples).where(eq(activitySamples.activityId, id)).limit(1);
  return { a, samples };
}
```

- [ ] **Step 2: Write `components/charts/weekly-load-bar.tsx`**

```tsx
"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

export function WeeklyLoadBar({ data }: { data: { week: string; load: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, left: 0, right: 0, bottom: 0 }}>
        <XAxis dataKey="week" tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a", color: "#f3f3f5" }} />
        <Bar dataKey="load" fill="#ff4dd2" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Write `components/charts/trend-line.tsx`**

```tsx
"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

export function TrendLine({ data, dataKey, color }: {
  data: Record<string, unknown>[]; dataKey: string; color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9a9aa3", fontSize: 11 }} domain={["auto", "auto"]} />
        <Tooltip contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a", color: "#f3f3f5" }} />
        <Line dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Write `app/training/page.tsx`**

```tsx
import Link from "next/link";
import { getTrainingOverview } from "@/db/queries/training";
import { MetricCard } from "@/components/cards/metric-card";
import { WeeklyLoadBar } from "@/components/charts/weekly-load-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { StatusPill } from "@/components/cards/status-pill";
import { fmtMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const { recentActivities, statusHistory, weeklyLoad } = await getTrainingOverview();
  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-magenta">Training</h1>

      <MetricCard title="Weekly load (last 8 weeks)" accent="text-magenta">
        <WeeklyLoadBar data={weeklyLoad} />
      </MetricCard>

      <MetricCard title="VO₂ max trend" accent="text-magenta">
        <TrendLine data={statusHistory.map(s => ({ date: s.date, v: s.vo2Max }))} dataKey="v" color="#ff4dd2" />
      </MetricCard>

      <MetricCard title="Activities" accent="text-magenta">
        <ul className="divide-y divide-ink-3">
          {recentActivities.map(a => (
            <li key={a.id}>
              <Link href={`/training/${a.id}`} className="grid grid-cols-5 gap-4 py-3 hover:bg-ink-3 px-2 rounded text-sm">
                <span className="text-fg-dim">{new Date(a.startTs).toLocaleDateString("de-DE")}</span>
                <span className="capitalize">{a.type.replace(/_/g, " ")}</span>
                <span>{fmtMin(a.durationSec)}</span>
                <span>{a.distanceM ? (a.distanceM / 1000).toFixed(2) + " km" : "–"}</span>
                <span>HR {a.avgHr ?? "–"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </MetricCard>

      <MetricCard title="Training status timeline" accent="text-magenta">
        <div className="flex flex-wrap gap-2">
          {statusHistory.slice(-14).map(s => (
            <div key={s.date} className="text-xs">
              <div className="text-fg-dim">{s.date.slice(5)}</div>
              <StatusPill status={s.status ?? null} />
            </div>
          ))}
        </div>
      </MetricCard>
    </div>
  );
}
```

- [ ] **Step 5: Write `app/training/[activityId]/page.tsx`**

```tsx
import { getActivity } from "@/db/queries/training";
import { MetricCard } from "@/components/cards/metric-card";
import { TrendLine } from "@/components/charts/trend-line";
import { fmtMin, fmtPace } from "@/lib/format";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const { a, samples } = await getActivity(activityId);
  if (!a) notFound();

  const hrSeries = (samples?.samples as { ts?: number[]; hr?: number[] } | null);
  const hrData = hrSeries?.ts && hrSeries.hr
    ? hrSeries.ts.map((t, i) => ({ date: new Date(t).toISOString().slice(11, 19), hr: hrSeries.hr![i] }))
    : [];

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="font-display text-3xl text-magenta capitalize">{a.type.replace(/_/g, " ")}</h1>
      <div className="text-fg-dim">{new Date(a.startTs).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard title="Duration">{fmtMin(a.durationSec)}</MetricCard>
        <MetricCard title="Distance">{a.distanceM ? (a.distanceM / 1000).toFixed(2) + " km" : "–"}</MetricCard>
        <MetricCard title="Avg HR">{a.avgHr ?? "–"}</MetricCard>
        <MetricCard title="Max HR">{a.maxHr ?? "–"}</MetricCard>
        <MetricCard title="Avg pace">{fmtPace(a.distanceM && a.durationSec ? a.distanceM / a.durationSec : null)}</MetricCard>
        <MetricCard title="Calories">{a.calories ?? "–"}</MetricCard>
        <MetricCard title="Training effect (aerobic)">{a.trainingEffectAerobic?.toFixed(1) ?? "–"}</MetricCard>
        <MetricCard title="Training effect (anaerobic)">{a.trainingEffectAnaerobic?.toFixed(1) ?? "–"}</MetricCard>
      </div>

      {hrData.length > 0 && (
        <MetricCard title="Heart rate" accent="text-magenta">
          <TrendLine data={hrData} dataKey="hr" color="#ff4dd2" />
        </MetricCard>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify**

```bash
pnpm dev
```

Visit `/training`, click into an activity. Confirm chart, list, and detail page all render.

- [ ] **Step 7: Commit**

```bash
git add app/training/ db/queries/training.ts components/charts/
git commit -m "feat: Training overview + activity detail pages"
```

---

### Task 13: Sleep page

**Files:**
- Create: `app/sleep/page.tsx`, `db/queries/sleep.ts`, `components/charts/consistency-heatmap.tsx`

**Interfaces:**
- Produces: `/sleep` showing last night detail, 30d trend, sleep debt, consistency heatmap.

- [ ] **Step 1: Write `db/queries/sleep.ts`**

```ts
import { db, sleepSessions } from "@/db";
import { desc, gte } from "drizzle-orm";

export async function getSleepOverview() {
  const since = new Date(); since.setDate(since.getDate() - 30);
  const rows = await db.select().from(sleepSessions)
    .where(gte(sleepSessions.date, since.toISOString().slice(0, 10)))
    .orderBy(desc(sleepSessions.date));

  const lastNight = rows[0] ?? null;
  const need = 8 * 3600; // configurable later
  const debt = rows.reduce((acc, r) => acc + Math.max(0, need - (r.durationTotalSec ?? 0)), 0);
  const avg30 = rows.length ? Math.round(rows.reduce((a, r) => a + (r.durationTotalSec ?? 0), 0) / rows.length) : 0;

  return { lastNight, history: rows.slice().reverse(), debt, avg30 };
}
```

- [ ] **Step 2: Write `components/charts/consistency-heatmap.tsx`**

```tsx
"use client";

export function ConsistencyHeatmap({ rows }: {
  rows: { date: string; startTs: string | null; durationTotalSec: number | null }[];
}) {
  // each row: bedtime hour bucket → cell color intensity
  const cells = rows.map(r => {
    if (!r.startTs) return { date: r.date, hour: null, intensity: 0 };
    const h = new Date(r.startTs).getHours();
    return { date: r.date, hour: h, intensity: (r.durationTotalSec ?? 0) / (8 * 3600) };
  });
  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map(c => (
        <div key={c.date}
          title={`${c.date} bedtime ${c.hour ?? "?"}h`}
          className="aspect-square rounded"
          style={{ background: `rgba(92, 242, 255, ${Math.min(1, c.intensity)})` }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `app/sleep/page.tsx`**

```tsx
import { getSleepOverview } from "@/db/queries/sleep";
import { HeroNumber } from "@/components/cards/hero-number";
import { MetricCard } from "@/components/cards/metric-card";
import { SleepStagesBar } from "@/components/charts/sleep-stages-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { ConsistencyHeatmap } from "@/components/charts/consistency-heatmap";
import { fmtMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SleepPage() {
  const { lastNight, history, debt, avg30 } = await getSleepOverview();
  const trend = history.map(r => ({ date: r.date.slice(5), v: (r.durationTotalSec ?? 0) / 3600 }));

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-cyan">Sleep</h1>

      <div className="grid grid-cols-4 gap-6">
        <HeroNumber value={lastNight?.garminSleepScore ?? "–"} label="last night score" color="text-cyan" />
        <HeroNumber value={fmtMin(lastNight?.durationTotalSec)} label="last night duration" color="text-cyan" />
        <HeroNumber value={fmtMin(avg30)} label="30d average" color="text-cyan" />
        <HeroNumber value={fmtMin(debt)} label="30d sleep debt vs 8h" color="text-cyan" />
      </div>

      <MetricCard title="Last night stages" accent="text-cyan">
        <SleepStagesBar
          deep={lastNight?.durationDeepSec ?? 0}
          light={lastNight?.durationLightSec ?? 0}
          rem={lastNight?.durationRemSec ?? 0}
          awake={lastNight?.durationAwakeSec ?? 0}
        />
        <div className="grid grid-cols-4 gap-4 text-fg-dim text-xs mt-2">
          <span>deep {fmtMin(lastNight?.durationDeepSec)}</span>
          <span>rem  {fmtMin(lastNight?.durationRemSec)}</span>
          <span>light {fmtMin(lastNight?.durationLightSec)}</span>
          <span>awake {fmtMin(lastNight?.durationAwakeSec)}</span>
        </div>
        <div className="text-fg-dim text-xs">awakenings: {lastNight?.awakeningsCount ?? "–"} · avg HR {lastNight?.avgHr ?? "–"} · resp {lastNight?.avgRespRate?.toFixed(1) ?? "–"} · SpO₂ {lastNight?.avgSpo2 ?? "–"}</div>
      </MetricCard>

      <MetricCard title="30-day duration trend (h)" accent="text-cyan">
        <TrendLine data={trend} dataKey="v" color="#5cf2ff" />
      </MetricCard>

      <MetricCard title="Consistency (last 30 days)" accent="text-cyan">
        <ConsistencyHeatmap rows={history.map(r => ({ date: r.date, startTs: r.startTs as unknown as string | null, durationTotalSec: r.durationTotalSec }))} />
      </MetricCard>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
pnpm dev
```

Visit `/sleep`. Confirm all four hero numbers populate, stages bar correct, trend line renders.

- [ ] **Step 5: Commit**

```bash
git add app/sleep/ db/queries/sleep.ts components/charts/consistency-heatmap.tsx
git commit -m "feat: Sleep dashboard with stages + trend + consistency"
```

---

### Task 14: Wellness page

**Files:**
- Create: `app/wellness/page.tsx`, `db/queries/wellness.ts`

**Interfaces:**
- Produces: `/wellness` with 30d trends for RHR, steps, calories, body battery wake, stress.

- [ ] **Step 1: Write `db/queries/wellness.ts`**

```ts
import { db, dailyWellness } from "@/db";
import { gte } from "drizzle-orm";

export async function getWellnessOverview() {
  const since = new Date(); since.setDate(since.getDate() - 30);
  const rows = await db.select().from(dailyWellness)
    .where(gte(dailyWellness.date, since.toISOString().slice(0, 10)))
    .orderBy(dailyWellness.date);
  return { rows };
}
```

- [ ] **Step 2: Write `app/wellness/page.tsx`**

```tsx
import { getWellnessOverview } from "@/db/queries/wellness";
import { MetricCard } from "@/components/cards/metric-card";
import { TrendLine } from "@/components/charts/trend-line";

export const dynamic = "force-dynamic";

export default async function WellnessPage() {
  const { rows } = await getWellnessOverview();
  const series = rows.map(r => ({
    date: r.date.slice(5),
    rhr: r.rhr,
    steps: r.steps,
    calories: r.caloriesTotal,
    bbWake: r.bodyBatteryWake,
    stress: r.stressAvg,
  }));

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-warm">Wellness</h1>
      <div className="grid grid-cols-2 gap-6">
        <MetricCard title="Resting HR (30d)" accent="text-warm"><TrendLine data={series} dataKey="rhr" color="#f5e6c8" /></MetricCard>
        <MetricCard title="Body Battery at wake (30d)" accent="text-lime"><TrendLine data={series} dataKey="bbWake" color="#b6ff39" /></MetricCard>
        <MetricCard title="Steps (30d)" accent="text-warm"><TrendLine data={series} dataKey="steps" color="#f5e6c8" /></MetricCard>
        <MetricCard title="Calories (30d)" accent="text-warm"><TrendLine data={series} dataKey="calories" color="#f5e6c8" /></MetricCard>
        <MetricCard title="Average stress (30d)" accent="text-amber"><TrendLine data={series} dataKey="stress" color="#ffb84d" /></MetricCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm dev
```

Visit `/wellness`. Confirm all five trend cards render.

- [ ] **Step 4: Commit**

```bash
git add app/wellness/ db/queries/wellness.ts
git commit -m "feat: Wellness dashboard with 30d trends"
```

---

## Phase 4 — Deploy + verify

### Task 15: Deploy preview, verify on phone, iterate

**Files:**
- None (deploy + verification)

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin git@github.com:nunoscholly/garmininsights.git  # or your URL
git push -u origin main
```

- [ ] **Step 2: Deploy preview**

```bash
vercel deploy
```

Note the preview URL.

- [ ] **Step 3: Trigger first ingestion on the deployed env**

Open the preview URL → sign in via Clerk → click "Sync now". Verify all four pages populate.

- [ ] **Step 4: Verify on phone**

Open preview URL on phone, sign in. Confirm: layouts responsive (side nav may need a mobile collapse — note for follow-up if cramped), charts render, sync button works.

- [ ] **Step 5: Promote to production**

```bash
vercel deploy --prod
```

- [ ] **Step 6: Set production cron**

`vercel.ts` already declares the cron. After production deploy:

```bash
vercel cron list
```

Confirm `0 7 * * *` is scheduled.

- [ ] **Step 7: Wait one full day, verify daily cron ran**

```bash
curl https://<prod-domain>/api/ingest/status
```

Expected: `lastRunAt` within last 24h, `ok: true`, `mode: "daily"`.

- [ ] **Step 8 (optional): Note follow-ups**

Open a `FOLLOWUPS.md` with anything noticed on phone (responsiveness, missing data, etc.). Don't commit it as scope creep — just a personal punch list.

---

## Self-Review

Walked the spec against the plan:

- **Architecture diagram** → Tasks 1–4, 10
- **Hosting tier (Hobby + manual sync)** → Task 9 + Task 15
- **Data model — all tables** → Task 3 schema (includes reserved `daily_scores` + `journal_entries`)
- **Data sources table — all 945 fields** → Task 7 + 8 (`shape_daily_wellness`, `shape_sleep`, `shape_training_status`, `shape_activity`)
- **Ingestion endpoints (sync + daily)** → Task 7 (Python) + Task 9 (Next.js proxy)
- **Auth refresh** → Task 6
- **Failure handling + `ingest_runs`** → Task 7 (catches per-endpoint), Task 9 (status route)
- **Pages — Today/Training/Sleep/Wellness** → Tasks 11–14
- **Visual direction (dark, neon-per-metric)** → Task 1 theme tokens, Task 10 nav colors, hero/metric/chart colors per page
- **Deferred (Journal, Insights, custom scores)** → schema reserves tables, no UI

No placeholders found. Types/names consistent across tasks (e.g. `dailyWellness`, `sleepSessions`, `trainingStatus`, `shape_*` / `persist_*` pairs match).

One thing the spec mentioned but I should call out as an implicit assumption: the `garth` exact API surface (token classes, exact endpoint paths) is taken from the library's current docs. If garth's API has drifted, Task 5 and Task 7 may need small adjustments. Not a plan defect — just a heads-up for the implementer.
