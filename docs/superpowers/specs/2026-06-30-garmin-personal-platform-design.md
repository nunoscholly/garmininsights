# Garmin Personal Analytics Platform — Design Spec

**Date:** 2026-06-30
**Owner:** Nuno
**Status:** Design approved, ready for implementation plan

## Purpose

A personal, Whoop-style analytics web app sitting on top of Garmin Connect data. Single user (the author). Pulls data from a Garmin Forerunner 945 via Garmin Connect, stores it canonically in Postgres, and renders a small number of high-polish dashboards prioritising training, sleep, and daily wellness.

Goal: a tool the author actually opens daily — on phone and laptop — because the views are tighter and more readable than Garmin Connect's, with the option to layer custom analytics on top later.

## Non-goals (v1)

- Multi-user / social features
- Mobile app (web only; PWA is acceptable if cheap)
- Custom score formulas (Recovery %, custom Strain) — explicitly deferred; Garmin's native scores are used as-is
- Journal / behavior logging — deferred
- Correlation insights / coaching — deferred
- Replacing Garmin Connect's activity browser — Garmin's is already good enough

## Architecture

```
┌────────────────────────────────┐
│  Next.js 16 App (Vercel)       │  UI, dashboards, manual "sync now"
│  - App Router                  │
│  - Reads Postgres via Drizzle  │
│  - Auth: Clerk (single-user    │
│    email allowlist)            │
└──────────────┬─────────────────┘
               │ reads
               ▼
┌────────────────────────────────┐
│  Neon Postgres                 │  canonical store (Vercel Marketplace)
└──────────────▲─────────────────┘
               │ writes
┌────────────────────────────────┐
│  Python Vercel Functions       │  Fluid Compute, Python 3.13
│  - /api/ingest/daily (cron)    │  garth → Garmin Connect
│  - /api/ingest/sync (on-demand)│
└──────────────┬─────────────────┘
               │ pulls
               ▼
       Garmin Connect (via garth)
       OAuth tokens persisted in Postgres (encrypted)
```

### Why these choices

- **garth** is the only realistic data source for personal use (B2B Garmin Health API not viable).
- **Python ingestion** is forced by garth being Python; Vercel Functions support Python 3.13 natively on Fluid Compute.
- **Postgres in the middle** decouples ingestion from UI; UI is fast because it reads pre-shaped rows, not raw Garmin payloads.
- **Next.js + TS** for the polished, animated dashboard layer the project hinges on.
- **Single-user Clerk** is the lowest-friction private-auth path on Vercel.

### Hosting tier

- Start on Vercel **Hobby ($0)** + Neon free tier + Clerk free tier.
- Hobby caps cron frequency at once-per-day. Mitigation: a manual **"Sync now"** button in the UI triggers `/api/ingest/sync` on demand. This is fine in practice because the watch only syncs to Garmin Connect when near the phone anyway.
- Pro upgrade ($20/mo) is the escape hatch if 15-min auto-sync is later desired. No code changes needed — only `vercel.ts` cron schedule edits.

## Data Sources (Forerunner 945, via garth)

What we pull and what's actually available on this watch:

| Field | Source | Notes |
|---|---|---|
| Activities (summary + samples) | `garth` activities endpoints | HR, pace, power, splits, training effect |
| Sleep duration + stages | `garth` sleep endpoint | Deep / light / REM / awake |
| **Sleep Score** | `garth` sleep endpoint | 945 has this via firmware; use as-is |
| Body Battery (wake / min / max / curve) | `garth` body battery endpoint | HRV-derived; treated as recovery proxy |
| RHR, daily max HR | `garth` daily endpoint | |
| Stress score (all-day, 0–100) | `garth` stress endpoint | HRV-derived |
| Steps, calories (total + active), intensity minutes, floors | `garth` daily endpoint | |
| Training Status | `garth` training status endpoint | productive / maintaining / strained / etc. |
| Training Load (acute + 7d) | `garth` training load endpoint | Used directly as the "strain" metric |
| Recovery Time (hours) | `garth` recovery endpoint | |
| VO2 Max | `garth` user metrics endpoint | |
| Race Predictor | `garth` user metrics endpoint | |
| Per-activity Training Effect (aerobic / anaerobic) | activity summary | |
| Pulse Ox | `garth` daily endpoint | |

**Not available on the 945:** HRV Status (the newer "last night avg HRV in ms"), Training Readiness, Morning Report. Treated as "not in v1, possibly re-evaluate when upgrading watches."

## Data Model

Drizzle ORM over Neon Postgres. JSONB used liberally for raw payloads so we can re-derive without re-fetching.

**Identity & auth**
- `users` — single row, Clerk user ID linkage.
- `garmin_credentials` — encrypted garth OAuth tokens, `last_refreshed_at`.

**Raw Garmin data (the source of truth — never mutated)**
- `activities` — id, start_ts, type, duration, distance, avg_hr, max_hr, calories, training_effect_aerobic, training_effect_anaerobic, training_load, vo2_max_at_time, raw_summary jsonb.
- `activity_samples` — activity_id, samples jsonb (compressed time series; HR / pace / power / cadence arrays). One row per activity, not per second.
- `daily_wellness` — date (PK), rhr, max_hr, body_battery_min, body_battery_max, body_battery_wake, body_battery_sleep, body_battery_curve jsonb, stress_avg, stress_curve jsonb, steps, calories_total, calories_active, intensity_minutes_mod, intensity_minutes_vig, floors, spo2_avg.
- `sleep_sessions` — date (PK), start_ts, end_ts, duration_total, duration_deep, duration_light, duration_rem, duration_awake, awakenings_count, avg_hr, avg_resp_rate, avg_spo2, garmin_sleep_score, raw_summary jsonb.
- `training_status` — date (PK), status, acute_load, chronic_load, vo2_max, recovery_time_hours, race_predictor jsonb.

**Derived (v1: empty — deferred)**
- `daily_scores` — table created but unused in v1; reserved for v2 custom scores.

**User input (v1: empty — deferred)**
- `journal_entries` — table created but unused in v1.

**Ops**
- `ingest_runs` — id, started_at, finished_at, ok bool, errors jsonb. One row per ingest invocation (cron or manual) for debugging and a UI "last sync" indicator.

### Why this shape

- Raw payloads stored verbatim in `raw_summary` jsonb columns so future score formulas don't require re-fetching from Garmin.
- One row per activity for `activity_samples` (compressed jsonb arrays) keeps Neon free tier (~0.5 GB) viable for years of data.
- Date-keyed daily tables make joins trivial for the dashboards.

## Pages / Information Architecture

V1 ships **four** dashboards. Anything below the line is deferred.

```
/              Today      — Hero view: Body Battery curve + wake value,
                            last night's Sleep Score + stages bar,
                            Training Status + Recovery Time + today's Load,
                            key wellness stats (steps, calories, RHR, stress).
                            "Sync now" button.

/training      Training   — Weekly load chart, activities list,
                            Training Status timeline, VO2 Max trend,
                            Race Predictor.
/training/[id] Activity   — Single activity: HR trace, splits, HR zones,
                            Training Effect breakdown, pace/power if present.

/sleep         Sleep      — Last night detail (stages timeline, awakenings,
                            avg HR / resp / SpO2),
                            7d / 30d trend lines, consistency heatmap,
                            sleep debt vs 30d need.

/wellness      Wellness   — RHR / steps / calories / Body Battery / stress
                            trend charts. All-day HR. Single scrollable
                            analytical surface.

— deferred —
/journal       (v2)
/insights      (v2)
```

### Visual direction

- Dark theme, ink-black background.
- Neon accents — one opinionated colour per metric, reused everywhere that metric appears (e.g. Body Battery = lime, Sleep = cyan, Training = magenta, Wellness misc = warm white).
- Hero numbers very large, animated on mount.
- Dense charts, no chart-junk, micro-interactions on hover.
- Stack: **shadcn/ui** + **Tailwind CSS v4** + **Recharts** + **Framer Motion**.

## Ingestion

### Endpoints

- `POST /api/ingest/sync` — on-demand pull. Idempotent: re-running for an already-ingested day overwrites with fresh data.
- `POST /api/ingest/daily` — cron entry point, runs `/sync` for `today` and `yesterday` to catch late-arriving sleep data.

### Schedule (Hobby tier)

- 1 daily cron at **09:00 Europe/Berlin** (configurable in `vercel.ts`).
- Manual "Sync now" button in UI for between-cron pulls.

### Auth refresh

- garth OAuth tokens encrypted at rest in `garmin_credentials`.
- Refreshed automatically on every ingest run if expired.
- Initial login: one-time bootstrap script run locally that writes the first tokens into the DB (Garmin login can require MFA / captcha so this must be interactive).

### Failure handling

- Per-endpoint try/except. A failure on one Garmin endpoint (e.g. sleep) does not block ingesting the others (e.g. training status).
- Each ingest run writes a row to `ingest_runs` (started_at, finished_at, ok bool, errors jsonb) for debugging.

## Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, React Server Components by default |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts (+ Framer Motion for hero animations) |
| ORM | Drizzle |
| DB | Neon Postgres (Vercel Marketplace) |
| Ingestion | Python 3.13 Vercel Functions, `garth` |
| Auth | Clerk (Vercel Marketplace, single-user allowlist) |
| Config | `vercel.ts` (typed) |
| Local dev | `pnpm dev` for Next.js; `vercel dev` for Python functions |

## Open questions (resolve during implementation, not blocking)

- Time zone storage strategy — store UTC + render in `Europe/Berlin`, or store local? Lean: UTC in DB, local in UI.
- Activity `samples` size on disk — confirm typical 1h-run sample payload fits comfortably in jsonb compressed.
- Initial garth bootstrap UX — interactive CLI script vs one-time `/admin/connect-garmin` page that handles MFA in the browser. Lean: CLI script committed to `scripts/bootstrap_garmin.py`.

## Out of scope explicitly

- Custom Recovery % / Strain formulas (v2)
- Journal & correlation insights (v2)
- Mobile native app
- Multi-user
- Data export / backup tooling beyond Postgres dumps
- Marketing site / public landing page
