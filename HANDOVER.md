# Garmin Insights — Handover

Personal Whoop-style analytics dashboard on top of Garmin Connect data (Forerunner 945). Single user. Free tier.

## Current State: LIVE ✅ (2026-07-02)

**Production: https://garmininsights.vercel.app** — deployed, Garmin connected, first sync succeeded (`{"ok":true,"errors":[]}`), all dashboards populated with real data.

- **Branch:** everything merged to `main` and pushed; feature branch deleted
- **Repo:** https://github.com/nunoscholly/garmininsights (GitHub → Vercel integration active: **every push to `main` auto-deploys production**)
- **Vercel project:** `nuno-schollmayers-projects-48d1f4fd/garmininsights`
- **Neon DB:** project `round-silence-25618427`, 10 tables (see `db/schema.ts`), holding real data since 2026-07-01
- **Daily cron:** registered and verified (`vercel crons ls`) — `0 7 * * *` UTC ≈ 09:00 Berlin CEST

## Architecture (30 sec version)

```
Next.js 16 App Router (Vercel)  ──reads──▶  Neon Postgres  ◀──writes──  Python Vercel Functions
     (UI: 4 dashboards)              (Drizzle ORM)         (garth pulls from Garmin Connect,
                                                            AES-GCM tokens in DB)
```

- **No auth.** Personal use, URL is obscure. Credential-touching endpoints (`/api/py/ingest`, `/api/py/connect`) gated by `CRON_SECRET` bearer token.
- **Manual sync:** button in UI header, or the "Sync now" button on `/connect`.
- **Garmin login:** `/connect` page (access code = `CRON_SECRET`); tokens auto-refresh. Terminal fallback: `scripts/bootstrap_garmin.py` (only needed if Garmin throws an MFA/verification challenge at the server IP).

## Daily operation — nothing to do

- Cron pulls today + yesterday (wellness, sleep, training status) plus the latest 20 activities each morning.
- Tokens auto-refresh on every sync. Re-login via `/connect` only if Garmin invalidates them (rare).
- Cron drifts 1h between summer/winter (Vercel cron is UTC-only). Documented in `vercel.ts`.

## If something breaks

1. Latest ingest result: `curl https://garmininsights.vercel.app/api/ingest/status`
2. Detailed errors land in `ingest_runs` (Neon): `SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 10;` — each error records date, endpoint, message, and traceback.
3. Runtime logs: `vercel logs https://garmininsights.vercel.app` or the Vercel dashboard.
4. Trigger a manual sync from the shell:
   ```bash
   curl -X POST "https://garmininsights.vercel.app/api/ingest/sync?mode=manual"
   ```
5. Probe Garmin payloads locally with the stored tokens (extremely useful — this is how all payload bugs were found):
   ```bash
   cd /Users/nunoschollmayer/Documents/GitHub/garmininsights
   set -a; source .env.local; set +a
   .venv/bin/python -c "
   import sys; sys.path.insert(0, 'api/py')
   from _garth_client import load_client
   c = load_client(1)
   print(c.connectapi('/usersummary-service/usersummary/daily/' + c.profile['displayName'] + '?calendarDate=2026-07-01'))"
   ```

## Deploy-time lessons (hard-won, don't rediscover)

1. **`vercel.ts` functions config:** never set `runtime:` for Python — that field is community-runtimes-only (`name@version`); Python is auto-detected. Setting it fails the build with "Function Runtimes must have a valid version."
2. **Vercel Python runtime does NOT put the entrypoint's dir on `sys.path`** — sibling imports (`_token_store`, `_garth_client`…) need the explicit `sys.path.insert` at the top of each entrypoint (`ingest.py`, `connect.py`). Local tests mask this because `tests/py/conftest.py` adds the path.
3. **Server-to-server fetches must NOT use `VERCEL_URL`** — it's the deployment-specific domain, which Vercel deployment protection intercepts with an SSO HTML page. Use `VERCEL_PROJECT_PRODUCTION_URL` (public alias). See `app/api/ingest/sync/route.ts`.
4. **Garmin API realities** (verified against live API 2026-07-01):
   - User-scoped endpoints want `client.profile["displayName"]` (a UUID) in the URL — a numeric id returns a shell of nulls, not an error.
   - Wellness curves (stress + body battery) come from `/wellness-service/wellness/dailyStress/{date}`, merged into the usersummary payload in `ingest.py`.
   - Training status: `/metrics-service/metrics/trainingstatus/aggregated/{date}` — per-device nesting under `mostRecentTrainingStatus.latestTrainingStatusData.{deviceId}`; status phrase (`RECOVERY_BALANCED`) is normalized to StatusPill keys (`recovery`) in `shape_training_status`.
   - All Garmin timestamps are epoch millis → converted via `_ms_to_dt` in `_persist.py`.
5. **`api/py/requirements.txt` is load-bearing** — Vercel installs Python deps from it. Keep in lockstep with `pyproject.toml`. `garth==0.8.0` is exact-pinned (unmaintained lib; token dataclass format must match what's stored in the DB).

## Environment variables

Live on Vercel (all 3 envs — production/preview/development):

- `DATABASE_URL` — Neon pooled connection string
- `GARMIN_TOKEN_KEY` — 32-byte hex, encrypts garth OAuth tokens at rest
- `CRON_SECRET` — 32-byte hex; gates ingest + connect endpoints; doubles as the `/connect` access code

Local: `.env.local` (pulled from Vercel via `vercel env pull`).

Rotate a secret:
```bash
NEW=$(openssl rand -hex 32)
echo $NEW | vercel env add GARMIN_TOKEN_KEY production --force
# repeat for preview, development, then vercel env pull .env.local
```
**If you rotate `GARMIN_TOKEN_KEY`, reconnect Garmin afterwards** (via `/connect`) — old tokens can't be decrypted.

## File map

```
app/                          Next.js pages
  today/                      Today dashboard (hero recovery, sleep, training, wellness)
  training/                   Training + activity detail
  sleep/                      Sleep dashboard
  wellness/                   30d trends: RHR, BB wake, steps, calories, stress
  connect/page.tsx            Gated Garmin login form + manual sync trigger
  api/ingest/sync/route.ts    Proxy → Python handler (adds CRON_SECRET; uses public prod URL)
  api/ingest/status/route.ts  Latest ingest_run row for the "last sync" indicator
  api/connect/status/route.ts Token presence check (connected + last_refreshed_at)
  layout.tsx                  Nav + sync button, no auth wrapping

api/py/                       Python Vercel Functions
  ingest.py                   Main handler: CRON_SECRET check → _ingest(mode)
  connect.py                  POST: CRON_SECRET gate → garth login → store tokens
  _token_store.py             Shared encrypted-token write path (bootstrap + /connect)
  _garth_client.py            Load/refresh garth OAuth tokens from DB
  _persist.py                 Shapers (verified against real payloads) + Jsonb upserts
  _crypto.py                  AES-GCM for token storage
  requirements.txt            Load-bearing for deploy (Python deps installed from it)

db/
  schema.ts                   10 tables (Drizzle)
  index.ts                    Neon HTTP driver
  queries/                    Per-page query fns (today, training, sleep, wellness)

components/
  cards/                      hero-number (opt. sub slot), metric-card, status-pill,
                              sync-button, delta-badge (▲/▼ vs baseline)
  charts/                     body-battery-curve, sleep-stages-bar, weekly-load-bar
                              (opt. tunnel band), trend-line (opt. zoneBands/
                              referenceLine/unit), hr-zones-bar, consistency-heatmap
  nav/side-nav.tsx            Fixed sidebar (/connect intentionally unlinked)
  theme/metric-colors.ts      Per-metric color tokens

lib/                          env, dates (Europe/Berlin), format helpers
lib/insights/                 Insight math (vitest-tested): baseline.ts (trailing avg,
                              null under 3 days), zones.ts (Garmin zone bands +
                              goodness coloring), hr-zones.ts (extract hrTimeInZone
                              from rawSummary), targets.ts (8h sleep, VO2 threshold)
tests/ts/                     Vitest unit tests for lib/insights + format (pnpm test)
scripts/
  bootstrap_garmin.py         Terminal Garmin login (MFA fallback only)

tests/py/                     Pytest: shapers, token store, connect endpoint (17 tests)
                              training_status fixture = recorded real payload shape

docs/superpowers/
  specs/2026-06-30-*.md       Original platform design spec
  specs/2026-07-01-*.md       /connect page design spec
  plans/                      Task-by-task implementation plans for both
```

## Known follow-ups (not blockers)

- **Activity HR chart is empty** on activity detail pages. The page expects `samples.samples.{ts, hr}` arrays but ingestion stores Garmin's raw `metricDescriptors + activityDetailMetrics` shape. Fix: derive `ts[]`/`hr[]` in ingest persistence or page render. Low priority — Garmin Connect does activity detail well.
- **Remaining synthetic fixtures**: `daily_wellness`, `sleep`, `activity_summary` fixtures are still hand-written (though shapes verified against live API). `training_status` fixture is already real.
- **Early-morning sync marks the run `ok=false`**: syncing "today" before the watch uploads sleep yields an empty sleep payload → `start_ts` NOT NULL violation on `sleep_sessions` insert. Everything else in the run persists fine; the missing night lands on the next sync. Fix: skip persist when `sleepTimeSeconds` is absent in `_persist.py`/`ingest.py`.
- **`training_status` chronic_load / recovery_time / race_predictor columns are always NULL** — the aggregated endpoint doesn't carry them; find endpoints if ever wanted. (`weekly_training_load` / `load_tunnel_min` / `load_tunnel_max` ARE persisted since 2026-07-03 — the Training page draws the optimal-load band from them.)
- **Insight-layer follow-up minors** (from review, none load-bearing): VO₂max trend arrow uses the 56d statusHistory window (spec said 30d); "7d avg" baselines are really "last 7 recorded days" (no date floor); sleep 8h progress bar renders empty when no sleep row; sub-30s HR zones label "0m"; DeltaBadge lacks component tests.
- Queries don't filter by `user_id` (single-user assumption).
- Vercel builds with Python 3.12 despite `requires-python >= 3.13` (harmless — matches local venv; add a `.python-version` to pin explicitly if desired).
- Deferred review minors: constant-time secret compare (`hmac.compare_digest`) for both endpoints; `autoComplete` hints on the /connect form; try/catch on status route DB call; `store_tokens` lacks a DB-fixture test.

## v2 candidates (deferred from spec, not implemented)

- **Custom Recovery %**, **custom Strain** — using Garmin's native scores instead (Body Battery, Sleep Score, Training Load, Training Status).
- **Journal** (log alcohol/caffeine/stress → correlate with next-day recovery). Table `journal_entries` exists in schema, unused.
- **Correlation insights / trends page.** Table `daily_scores` reserved for this.

## Where to look for context

- **Specs**: `docs/superpowers/specs/` (platform design + /connect design)
- **Plans**: `docs/superpowers/plans/`
- **Execution log**: `.superpowers/sdd/progress.md` (gitignored — per-task commits, review findings, deploy debugging trail)

## Tooling assumed

- Node 22+, pnpm (via corepack or `~/.npm-global/bin/pnpm`); `pnpm test` runs the vitest suite
- Python 3.12+ locally (`.venv` in repo root) for tests + local Garmin probing
- Vercel CLI on PATH (`~/.npm-global/bin/vercel`)
- `openssl` for rotating secrets

## Contact / credentials

- Vercel account: `nuno-schollmayers-projects-48d1f4fd`
- Neon project: `round-silence-25618427`
- Garmin login: nunoscholly@gmail.com
- Watch: Forerunner 945
