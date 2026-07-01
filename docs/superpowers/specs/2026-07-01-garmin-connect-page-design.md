# Garmin Connect Page — Design

**Date:** 2026-07-01
**Status:** Approved, pending implementation plan
**Context:** Personal single-user Garmin analytics app. Today the only way to log in to
Garmin and store OAuth tokens is a local interactive script (`scripts/bootstrap_garmin.py`).
This spec adds an in-app page so the user can (re)connect their Garmin account from the
deployed website, with no terminal — for the common (no-MFA-challenge) case.

## Goal

A `/connect` page in the deployed app where the user submits their Garmin credentials once,
and the app runs the same `garth` login the bootstrap script does, then stores the encrypted
OAuth tokens in `garmin_credentials` for `user_id = 1`. After connecting, data ingestion
works exactly as it does today (daily cron + manual "sync now").

Non-goals: multi-user accounts, Garmin OAuth "Login with Garmin" button (Garmin has no such
public API for this use case), replacing the bootstrap script (it stays as the MFA fallback).

## Security model

The rest of the app is unauthenticated (URL obscurity, read-only dashboards). This page is
different: it collects the user's **real Garmin password**, so an open endpoint would let
anyone with the URL fire password-guess attempts at the user's Garmin account (risking a
Garmin-side lockout).

**Decision:** gate the page and endpoint with the existing `CRON_SECRET`.
- The page has an "access code" field. Its value is sent as `Authorization: Bearer <code>`.
- `api/py/connect.py` rejects any request whose bearer token ≠ `CRON_SECRET` (same check the
  ingest endpoint already uses). No new secret to manage.
- The Garmin password is only ever sent from the browser to our own Python function over
  HTTPS, used immediately for `garth.login`, and never stored (only the resulting OAuth
  tokens are persisted, encrypted).

## MFA handling — best-effort, script fallback

Account-level MFA is off, but Garmin may still challenge a login coming from an unfamiliar
datacenter IP (which every Vercel function is). A full in-app two-step MFA flow is **not
cleanly supported**: garth's mid-MFA `client_state` holds a live HTTP client object (open
session + cookies), which cannot be serialized to survive between two stateless serverless
requests.

**Decision (best-effort):** the endpoint attempts a one-shot login. It calls
`garth.login(email, password, return_on_mfa=True)`:
- Tokens returned (no challenge) → store them → `connected`. This is the normal path.
- `("needs_mfa", ...)` returned → do **not** attempt to persist any state. Respond
  `{ status: "mfa_required" }`, and the page tells the user to run
  `scripts/bootstrap_garmin.py` for this one connect. No `pending_logins` table, no
  garth-internals hacking.

This is guaranteed to work for the common case and degrades to a clear, actionable message
in the rare challenge case.

## Components

### 1. Page — `app/connect/page.tsx` (client component)
- Fields: **access code** (CRON_SECRET), **Garmin email** (prefilled with the default),
  **password**.
- Status area: shows current connection state ("Connected — tokens refreshed <when>" /
  "Not connected") read on load, plus inline success/error from submit.
- On `mfa_required`: shows the fallback instruction (run the bootstrap script this once),
  including the exact command.
- After a successful connect, shows a **"Sync now"** button that POSTs the existing
  `/api/ingest/sync?mode=manual` so the user can pull data immediately and confirm it worked.
- Unlinked from the side nav (rare-use page; keeps dashboard nav clean). Reached by typing
  the URL.

### 2. Endpoint — `api/py/connect.py` (Python 3.13 Vercel function)
Same runtime/config bucket as `api/py/ingest.py` (already covered by the `api/py/*.py`
functions glob in `vercel.ts`; runtime deps already added to `api/py/requirements.txt`).

- **Auth:** reject if `Authorization: Bearer` ≠ `CRON_SECRET` → 401.
- **Body:** `{ email, password }`.
- Run `garth.login(email, password, return_on_mfa=True)`.
  - Tokens returned → ensure the `users` row for `user_id = 1` exists, then encrypt + upsert
    into `garmin_credentials` (reuse the shared token-store step) → `{ status: "connected" }`.
  - `("needs_mfa", ...)` → `{ status: "mfa_required" }` (nothing persisted).
- All Garmin/network errors caught and returned as `{ status: "error", message }` with a
  sensible HTTP status; never leak the password or a raw stack trace to the client.

### 3. Status read — how the page knows if connected
A small Next.js route (`app/api/connect/status/route.ts`) that reads
`garmin_credentials.last_refreshed_at` for `user_id = 1` via the existing Drizzle DB layer,
so the page stays a thin client and no Garmin secret is needed just to render status.
Returns `{ connected: boolean, lastRefreshedAt: string | null }`.

### 4. Shared token-store step
Factor the "ensure user row + encrypt + upsert tokens for user_id" logic so `connect.py` and
`bootstrap_garmin.py` agree on the exact write (avoids drift between the two login paths).
Lives alongside the other `api/py` helpers.

## Data flow

```
Browser (/connect)                 api/py/connect.py                Neon
  |  POST {email, password}          |                                |
  |  Authorization: Bearer CRON ---> | verify CRON_SECRET             |
  |                                  | garth.login(return_on_mfa)     |
  |            (no challenge)         | ensure user row               |
  |            <-- connected          | encrypt tokens -> upsert ----> | garmin_credentials
  |                                  |                                |
  |            (challenge)            |                                |
  |            <-- mfa_required       | (nothing persisted)           |
  |            page: "run bootstrap_garmin.py this once"              |
  |                                  |                                |
  |  POST /api/ingest/sync?mode=manual  (existing) -> pulls Garmin data
  |  GET  /api/connect/status  -> {connected, lastRefreshedAt}       | garmin_credentials
```

## Error handling

- Wrong access code → 401, page shows "Access code incorrect".
- Wrong Garmin password → Garmin returns auth error → `{status:"error"}`, page shows
  "Garmin rejected those credentials".
- MFA challenge → `{status:"mfa_required"}`, page shows the script-fallback instruction.
- Network/Garmin 5xx → surfaced as a retryable error message.
- Password is never persisted or logged; only encrypted tokens are stored at rest.

## Testing

- Python unit tests (pytest, existing `tests/py/` harness), `garth` mocked so no real
  network/credentials: auth rejection (401), connected path (tokens stored via shared step),
  `mfa_required` path (nothing stored), and generic error path.
- Reuse the existing token-write assertions where practical (the store path is shared with
  bootstrap).
- Manual end-to-end: deploy preview → open `/connect` → enter code + real Garmin creds →
  expect `connected` → "Sync now" → dashboards populate.

## Reused vs new

- **Reused:** `_crypto.encrypt/decrypt`, the token-write shape from `bootstrap_garmin.py`
  (now factored into a shared step both call), the ingest sync route, the Drizzle DB layer,
  the `CRON_SECRET` bearer-auth pattern.
- **New:** `app/connect/page.tsx`, `api/py/connect.py`, `app/api/connect/status/route.ts`,
  the shared token-store helper (bootstrap refactored to use it).
- **Not needed** (dropped after MFA-persistence discovery): `pending_logins` table, DB
  migration, two-step resume endpoint.

## Open follow-ups (not blockers)

- If, in practice, Garmin repeatedly challenges the Vercel IP, revisit whether a
  cookie-reconstruction two-step is worth the fragility. For now the script fallback covers it.
