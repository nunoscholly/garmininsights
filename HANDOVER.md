# Garmin Insights — Handover

Personal Whoop-style analytics dashboard on top of Garmin Connect data (Forerunner 945). Single user. Free tier.

## Current State

- **Branch:** `feat/garmininsights-mvp` (not merged to `main`, not pushed to remote yet)
- **Repo:** https://github.com/nunoscholly/garmininsights
- **Vercel project:** `nuno-schollmayers-projects-48d1f4fd/garmininsights` (linked, but no deploys yet)
- **Neon DB:** project `round-silence-25618427`, schema applied (10 tables — see `db/schema.ts`)
- **19 commits** on the branch — clean history, one commit per plan task + a few chores/fixes

## Architecture (30 sec version)

```
Next.js 16 App Router (Vercel)  ──reads──▶  Neon Postgres  ◀──writes──  Python Vercel Functions
     (UI: 4 dashboards)              (Drizzle ORM)         (garth pulls from Garmin Connect,
                                                            AES-GCM tokens in DB)
```

- **No auth.** Personal use, URL is obscure. Ingest endpoint is protected by `CRON_SECRET`.
- **Cron:** `0 7 * * *` UTC (≈ 09:00 Berlin CEST / 08:00 CET) via `vercel.ts` — hits `/api/ingest/sync?mode=daily`
- **Manual sync:** button in UI header

## Deploy status — Phase progress

| Phase | Task | Status |
|---|---|---|
| A | Vercel link + Neon + env vars + migration | ✅ done |
| B | `python scripts/bootstrap_garmin.py` (interactive Garmin login + MFA) | 🟡 **user still needs to do** |
| C | `vercel deploy` then `vercel deploy --prod` | ⏳ pending Phase B |

## To resume

### If Phase B is not yet done

```bash
cd /Users/nunoschollmayer/Documents/GitHub/garmininsights
source .venv/bin/activate
set -a; source .env.local; set +a
python scripts/bootstrap_garmin.py
# → Garmin email → password → MFA code → "OK: wrote tokens for user_id=1"
```

### Then deploy

```bash
export PATH="$HOME/.npm-global/bin:$PATH"

# preview
vercel deploy
# → open preview URL, click "sync now", verify pages populate

# production
vercel deploy --prod

# confirm daily cron scheduled
vercel cron list
```

### If something breaks

1. Check the latest ingest run:
   ```bash
   curl https://<prod-domain>/api/ingest/status
   ```
2. Check ingest_runs errors in Neon (`SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 10;`)
3. Test the Python handler locally:
   ```bash
   vercel dev
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/py/ingest
   ```

## Environment variables

Live on Vercel (all 3 envs — production/preview/development):

- `DATABASE_URL` — Neon pooled connection string
- `GARMIN_TOKEN_KEY` — 32-byte hex, encrypts garth OAuth tokens at rest
- `CRON_SECRET` — 32-byte hex, gates `/api/py/ingest` via `Authorization: Bearer` header

Local: `.env.local` (pulled from Vercel via `vercel env pull`).

Regen either secret:
```bash
NEW=$(openssl rand -hex 32)
echo $NEW | vercel env add GARMIN_TOKEN_KEY production --force
# repeat for preview, development, then vercel env pull .env.local
```
**If you rotate GARMIN_TOKEN_KEY, you must also re-run `bootstrap_garmin.py`** — old tokens can't be decrypted.

## File map

```
app/                          Next.js pages
  today/                      Today dashboard (hero recovery, sleep, training, wellness)
  training/                   Training + activity detail
  sleep/                      Sleep dashboard
  wellness/                   30d trends: RHR, BB wake, steps, calories, stress
  api/ingest/sync/route.ts    Proxy → Python handler (adds CRON_SECRET)
  api/ingest/status/route.ts  Latest ingest_run row for the "last sync" indicator
  layout.tsx                  Nav + sync button, no auth wrapping

api/py/                       Python Vercel Functions (python 3.13)
  ingest.py                   Main handler: CRON_SECRET check → _ingest(mode)
  _garth_client.py            Load/refresh garth OAuth tokens from DB
  _persist.py                 Shapers + Jsonb-wrapped upserts
  _crypto.py                  AES-GCM for token storage

db/
  schema.ts                   10 tables (Drizzle)
  index.ts                    Neon HTTP driver
  queries/                    Per-page query fns (today, training, sleep, wellness)

components/
  cards/                      hero-number, metric-card, status-pill, sync-button
  charts/                     body-battery-curve, sleep-stages-bar, weekly-load-bar,
                              trend-line, consistency-heatmap
  nav/side-nav.tsx            Fixed sidebar
  theme/metric-colors.ts      Per-metric color tokens

lib/                          env, dates (Europe/Berlin), format helpers
scripts/
  bootstrap_garmin.py         One-time interactive Garmin login (user gate)

tests/py/                     Pytest for _persist shape functions (synthetic fixtures)

docs/superpowers/
  specs/2026-06-30-*.md       Design spec
  plans/2026-06-30-*.md       Task-by-task implementation plan
```

## Known follow-ups (recorded during final review, not blockers)

**Should fix once you have real data flowing:**

- **Activity HR chart is empty.** The page expects `samples.samples.{ts, hr}` arrays but ingestion stores Garmin's raw `metricDescriptors + activityDetailMetrics` shape. Fix: derive `ts[]`/`hr[]` in the ingest persistence step (or in the page render). Activity detail was a low-priority v1 feature — Garmin Connect already does activities well.

- **`training_status` endpoint URL is a best-guess** (`/metrics-service/metrics/maxmet/latest/{USER_ID}`). If `ingest_runs.errors` shows a 404 on this endpoint, grab the real URL from your Garmin Connect web-app network tab and update `api/py/ingest.py`.

- **Synthetic fixtures.** `tests/py/fixtures/*.json` are placeholder shapes, not recorded payloads. After first successful sync, replace with real samples so tests catch actual drift.

**Nice-to-have:**

- Queries don't filter by `user_id` yet (single-user assumption). Add if you ever open this up.
- `pyproject.toml` has no upper bound on garth — if it breaks, pin to `~=0.4`.
- `emailAddresses[0]` was in an earlier Clerk version — now n/a since Clerk was removed.
- Cron drifts by 1h between summer/winter (Vercel cron is UTC-only). Documented in `vercel.ts`.

## v2 candidates (deferred from spec, not implemented)

- **Custom Recovery %**, **custom Strain** — spec deferred these; we use Garmin's native scores (Body Battery, Sleep Score, Training Load, Training Status) instead.
- **Journal** (log alcohol/caffeine/stress → correlate with next-day recovery). Table `journal_entries` already exists in schema, unused.
- **Correlation insights / trends page.** Table `daily_scores` reserved for this.

## Where to look for context

- **Spec** (why decisions were made): `docs/superpowers/specs/2026-06-30-garmin-personal-platform-design.md`
- **Plan** (task-by-task): `docs/superpowers/plans/2026-06-30-garmin-personal-platform.md`
- **Execution log**: `.superpowers/sdd/progress.md` (gitignored — see it for what each task committed and any per-task findings)
- **Per-task subagent reports**: `.superpowers/sdd/task-*-report.md` (gitignored)
- **Per-task review packages**: `.superpowers/sdd/review-*.diff` (gitignored)

## Tooling assumed

- Node 22+, pnpm (via corepack or `~/.npm-global/bin/pnpm`)
- Python 3.13 for Vercel (locally 3.12 is fine for `bootstrap_garmin.py` + tests)
- Vercel CLI on PATH (`~/.npm-global/bin/vercel` — PATH exported in `~/.zshrc`)
- `openssl` for rotating secrets

## Contact / credentials

- Vercel account: `nuno-schollmayers-projects-48d1f4fd`
- Neon project: `round-silence-25618427`
- Garmin login: nunoscholly@gmail.com (used in bootstrap)
- Watch: Forerunner 945
