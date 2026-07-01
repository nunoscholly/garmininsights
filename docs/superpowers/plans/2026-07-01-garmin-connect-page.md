# Garmin Connect Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app `/connect` page so the user can log in to Garmin from the deployed website (common no-MFA case) and store encrypted OAuth tokens, without using the terminal.

**Architecture:** A gated Python Vercel function (`api/py/connect.py`) runs a one-shot `garth` login and writes tokens via a shared token-store helper that the bootstrap script also uses. A thin Next.js status route reports connection state. A client page collects credentials + the `CRON_SECRET` access code and calls the function directly. MFA challenges fall back to the bootstrap script (no state persisted).

**Tech Stack:** Next.js 16 (App Router, client components), Python 3.13 Vercel functions (`BaseHTTPRequestHandler`), `garth==0.8.0`, `psycopg`, `cryptography` (AES-GCM), Drizzle + Neon HTTP, pytest.

## Global Constraints

- Python runtime deps for `api/py/*.py` are declared in `api/py/requirements.txt` and kept in lockstep with `pyproject.toml`. `garth==0.8.0` (exact pin — unmaintained; token dataclass format must match the version bootstrap used).
- `USER_ID = 1` (single-user assumption, matches `ingest.py` and bootstrap).
- Endpoint auth: `Authorization: Bearer <CRON_SECRET>`, same pattern as `api/py/ingest.py` — reject if the env secret is empty or the header doesn't match exactly.
- Default Garmin email: `nunoscholly@gmail.com`.
- Token JSON shape stored in `garmin_credentials.encrypted_tokens`: `{"oauth1": <OAuth1Token.__dict__>, "oauth2": <OAuth2Token.__dict__>}`, AES-GCM encrypted via `_crypto.encrypt`, serialized with `json.dumps(..., default=str)`. Must round-trip through `_garth_client.load_client` (which builds `OAuth1Token(**tokens["oauth1"])`, `OAuth2Token(**tokens["oauth2"])`).
- Never persist or log the Garmin password. Only encrypted tokens are stored.
- Match existing Tailwind conventions: `bg-ink`, `text-fg`, `border-ink-3`, `bg-ink-2`, `rounded`, `font-display`.

---

### Task 1: Shared token-store helper + refactor bootstrap to use it

**Files:**
- Create: `api/py/_token_store.py`
- Modify: `scripts/bootstrap_garmin.py:34-66` (replace inline token write with helper call)
- Test: `tests/py/test_token_store.py`

**Interfaces:**
- Consumes: `_crypto.encrypt` (existing), `os.environ["DATABASE_URL"]`, `os.environ["GARMIN_TOKEN_KEY"]`.
- Produces:
  - `build_encrypted_tokens(oauth1, oauth2) -> str` — pure-ish: returns AES-GCM-encrypted JSON of `{"oauth1": oauth1.__dict__, "oauth2": oauth2.__dict__}` using `json.dumps(..., default=str)`.
  - `store_tokens(email: str, oauth1, oauth2) -> int` — ensures a `users` row exists (insert with `clerk_id="pending-clerk-link"` on first run, else look up by email), upserts `garmin_credentials`, returns the `user_id`.

- [ ] **Step 1: Write the failing test**

Create `tests/py/test_token_store.py`:

```python
# tests/py/test_token_store.py
import json
import os
from types import SimpleNamespace
import pytest
import _token_store
import _crypto


def _fake_tokens():
    oauth1 = SimpleNamespace(
        oauth_token="t1", oauth_token_secret="s1", mfa_token=None,
        mfa_expiration_timestamp=None, domain="garmin.com",
    )
    oauth2 = SimpleNamespace(
        scope="scope", jti="jti", token_type="Bearer", access_token="a1",
        refresh_token="r1", expires_in=3600, expires_at=999,
        refresh_token_expires_in=7200, refresh_token_expires_at=1999,
    )
    return oauth1, oauth2


def test_build_encrypted_tokens_roundtrips_to_expected_shape(monkeypatch):
    monkeypatch.setenv("GARMIN_TOKEN_KEY", "00" * 32)
    oauth1, oauth2 = _fake_tokens()

    blob = _token_store.build_encrypted_tokens(oauth1, oauth2)
    decoded = json.loads(_crypto.decrypt(blob))

    assert decoded["oauth1"]["oauth_token"] == "t1"
    assert decoded["oauth1"]["oauth_token_secret"] == "s1"
    assert decoded["oauth2"]["access_token"] == "a1"
    assert decoded["oauth2"]["refresh_token"] == "r1"
    # keys must match what _garth_client rebuilds with (OAuth1Token/OAuth2Token fields)
    assert set(decoded.keys()) == {"oauth1", "oauth2"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/py/test_token_store.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named '_token_store'`

- [ ] **Step 3: Write minimal implementation**

Create `api/py/_token_store.py`:

```python
# api/py/_token_store.py
import os
import json
from datetime import datetime, timezone
import psycopg
from _crypto import encrypt


def build_encrypted_tokens(oauth1, oauth2) -> str:
    payload = {"oauth1": oauth1.__dict__, "oauth2": oauth2.__dict__}
    return encrypt(json.dumps(payload, default=str))


def store_tokens(email: str, oauth1, oauth2) -> int:
    encrypted = build_encrypted_tokens(oauth1, oauth2)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
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
    return user_id
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/py/test_token_store.py -v`
Expected: PASS

- [ ] **Step 5: Refactor bootstrap to use the helper**

Replace the token-write block in `scripts/bootstrap_garmin.py`. The new file body (keep the `sys.path.insert`, `garth` import, and login/MFA logic; replace the manual DB write):

```python
# scripts/bootstrap_garmin.py
"""
Run locally once (or when a web connect hits an MFA challenge):
  GARMIN_TOKEN_KEY=... DATABASE_URL=... python scripts/bootstrap_garmin.py

Prompts for Garmin email/password (MFA if enabled), then writes encrypted
tokens to garmin_credentials for user_id=1. Creates the user row if absent.
"""
import os
import sys
import getpass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api", "py"))
import garth
from _token_store import store_tokens

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

    user_id = store_tokens(email, garth.client.oauth1_token, garth.client.oauth2_token)
    print(f"OK: wrote tokens for user_id={user_id}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Verify bootstrap still imports cleanly (no run)**

Run: `.venv/bin/python -c "import sys, os; sys.path.insert(0, 'api/py'); import ast; ast.parse(open('scripts/bootstrap_garmin.py').read()); print('parse OK')"`
Expected: `parse OK`

- [ ] **Step 7: Commit**

```bash
git add api/py/_token_store.py tests/py/test_token_store.py scripts/bootstrap_garmin.py
git commit -m "feat: shared token-store helper; bootstrap uses it"
```

---

### Task 2: Connect endpoint (`api/py/connect.py`)

**Files:**
- Create: `api/py/connect.py`
- Test: `tests/py/test_connect.py`
- Commit (also): `api/py/requirements.txt`, `pyproject.toml` (deploy-prep already edited on disk — the connect function is the first thing that needs garth installed at deploy time)

**Interfaces:**
- Consumes: `_token_store.store_tokens` (Task 1), `garth.login`, `os.environ["CRON_SECRET"]`.
- Produces:
  - `authorized(auth_header: str) -> bool` — true iff `CRON_SECRET` is non-empty and `auth_header == f"Bearer {CRON_SECRET}"`.
  - `attempt_connect(email: str, password: str) -> dict` — runs `garth.login(email, password, return_on_mfa=True)`; on `("needs_mfa", ...)` returns `{"status": "mfa_required"}` (stores nothing); otherwise unpacks `(oauth1, oauth2)`, calls `store_tokens`, returns `{"status": "connected"}`.
  - `class handler(BaseHTTPRequestHandler)` with `do_POST`.

- [ ] **Step 1: Write the failing tests**

Create `tests/py/test_connect.py`:

```python
# tests/py/test_connect.py
from types import SimpleNamespace
import pytest
import connect


def _fake_tokens():
    return SimpleNamespace(oauth_token="t1"), SimpleNamespace(access_token="a1")


def test_authorized_matches_bearer(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "secret123secret123secret123secret1")
    assert connect.authorized("Bearer secret123secret123secret123secret1") is True
    assert connect.authorized("Bearer wrong") is False
    assert connect.authorized("") is False


def test_authorized_false_when_secret_empty(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "")
    assert connect.authorized("Bearer ") is False


def test_attempt_connect_stores_tokens_on_success(monkeypatch):
    o1, o2 = _fake_tokens()
    monkeypatch.setattr(connect.garth, "login", lambda e, p, return_on_mfa: (o1, o2))
    called = {}
    monkeypatch.setattr(
        connect, "store_tokens",
        lambda email, a, b: called.update(email=email, a=a, b=b) or 1,
    )

    result = connect.attempt_connect("me@example.com", "pw")

    assert result == {"status": "connected"}
    assert called["email"] == "me@example.com"
    assert called["a"] is o1 and called["b"] is o2


def test_attempt_connect_returns_mfa_required_and_stores_nothing(monkeypatch):
    monkeypatch.setattr(
        connect.garth, "login",
        lambda e, p, return_on_mfa: ("needs_mfa", {"client": object()}),
    )
    stored = {"called": False}
    monkeypatch.setattr(
        connect, "store_tokens",
        lambda *a, **k: stored.update(called=True),
    )

    result = connect.attempt_connect("me@example.com", "pw")

    assert result == {"status": "mfa_required"}
    assert stored["called"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/py/test_connect.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'connect'`

- [ ] **Step 3: Write minimal implementation**

Create `api/py/connect.py`:

```python
# api/py/connect.py
import os
import json
from http.server import BaseHTTPRequestHandler

import garth
from _token_store import store_tokens


def authorized(auth_header: str) -> bool:
    secret = os.environ.get("CRON_SECRET", "")
    return bool(secret.strip()) and auth_header == f"Bearer {secret}"


def attempt_connect(email: str, password: str) -> dict:
    result = garth.login(email, password, return_on_mfa=True)
    if isinstance(result, tuple) and result[0] == "needs_mfa":
        return {"status": "mfa_required"}
    oauth1, oauth2 = result
    store_tokens(email, oauth1, oauth2)
    return {"status": "connected"}


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_POST(self):
        if not authorized(self.headers.get("Authorization", "")):
            self._send(401, {"status": "error", "message": "Access code incorrect"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"status": "error", "message": "Invalid request body"})
            return

        email = (body.get("email") or "").strip()
        password = body.get("password") or ""
        if not email or not password:
            self._send(400, {"status": "error", "message": "Email and password required"})
            return

        try:
            result = attempt_connect(email, password)
            self._send(200, result)
        except garth.exc.GarthHTTPError:
            self._send(401, {"status": "error", "message": "Garmin rejected those credentials"})
        except Exception:
            self._send(502, {"status": "error", "message": "Could not reach Garmin — try again"})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/py/test_connect.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Run the full Python suite (no regressions)**

Run: `.venv/bin/python -m pytest tests/py -v`
Expected: all pass (existing persist tests + token_store + connect)

- [ ] **Step 6: Commit (include deploy-prep files)**

```bash
git add api/py/connect.py tests/py/test_connect.py api/py/requirements.txt pyproject.toml
git commit -m "feat: /connect Python endpoint (gated one-shot Garmin login); pin garth, fill requirements.txt"
```

---

### Task 3: Connection-status route (`app/api/connect/status/route.ts`)

**Files:**
- Create: `app/api/connect/status/route.ts`

**Interfaces:**
- Consumes: `db`, `garminCredentials` from `@/db`; `USER_ID = 1`.
- Produces: `GET /api/connect/status` → `{ connected: boolean, lastRefreshedAt: string | null }`.

- [ ] **Step 1: Write the implementation**

Create `app/api/connect/status/route.ts`:

```typescript
// app/api/connect/status/route.ts
import { NextResponse } from "next/server";
import { db, garminCredentials } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const USER_ID = 1;

export async function GET() {
  const [row] = await db
    .select()
    .from(garminCredentials)
    .where(eq(garminCredentials.userId, USER_ID))
    .limit(1);

  return NextResponse.json({
    connected: Boolean(row),
    lastRefreshedAt: row ? row.lastRefreshedAt.toISOString() : null,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify the route responds (dev server)**

Run: `set -a; source .env.local; set +a; npm run dev &` then `sleep 4 && curl -s http://localhost:3000/api/connect/status`
Expected: `{"connected":false,"lastRefreshedAt":null}` (before first connect). Stop dev server after (`kill %1`).

- [ ] **Step 4: Commit**

```bash
git add app/api/connect/status/route.ts
git commit -m "feat: /api/connect/status route (reports garmin_credentials state)"
```

---

### Task 4: Connect page (`app/connect/page.tsx`)

**Files:**
- Create: `app/connect/page.tsx`

**Interfaces:**
- Consumes: `POST /api/py/connect` (Task 2) with `Authorization: Bearer <accessCode>` and body `{email, password}`; `GET /api/connect/status` (Task 3); `POST /api/ingest/sync?mode=manual` (existing).
- Produces: the `/connect` route (no exported values consumed elsewhere).

- [ ] **Step 1: Write the implementation**

Create `app/connect/page.tsx`:

```tsx
// app/connect/page.tsx
"use client";

import { useEffect, useState } from "react";

const EMAIL_DEFAULT = "nunoscholly@gmail.com";

type Status = { connected: boolean; lastRefreshedAt: string | null };

export default function ConnectPage() {
  const [accessCode, setAccessCode] = useState("");
  const [email, setEmail] = useState(EMAIL_DEFAULT);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "mfa"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/connect/status");
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/py/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessCode}`,
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.status === "connected") {
        setConnected(true);
        setPassword("");
        setMsg({ kind: "ok", text: "Connected. Garmin tokens stored." });
        refreshStatus();
      } else if (data.status === "mfa_required") {
        setMsg({
          kind: "mfa",
          text:
            "Garmin wants a verification code for this server. Run this once in a terminal:\n" +
            "  python scripts/bootstrap_garmin.py",
        });
      } else {
        setMsg({ kind: "err", text: data.message ?? "Something went wrong" });
      }
    } catch {
      setMsg({ kind: "err", text: "Network error — try again" });
    } finally {
      setBusy(false);
    }
  }

  async function onSyncNow() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ingest/sync?mode=manual", { method: "POST" });
      const data = await res.json();
      setMsg({
        kind: data.ok ? "ok" : "err",
        text: data.ok ? "Sync complete — check your dashboards." : "Sync ran with errors.",
      });
    } catch {
      setMsg({ kind: "err", text: "Sync failed to start" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl mb-2">Connect Garmin</h1>
      <p className="text-sm text-fg/60 mb-6">
        {status?.connected
          ? `Connected — tokens refreshed ${status.lastRefreshedAt?.slice(0, 10) ?? "?"}.`
          : "Not connected."}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="password" placeholder="Access code" value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)} required
          className="bg-ink-2 border border-ink-3 rounded px-3 py-2"
        />
        <input
          type="email" placeholder="Garmin email" value={email}
          onChange={(e) => setEmail(e.target.value)} required
          className="bg-ink-2 border border-ink-3 rounded px-3 py-2"
        />
        <input
          type="password" placeholder="Garmin password" value={password}
          onChange={(e) => setPassword(e.target.value)} required
          className="bg-ink-2 border border-ink-3 rounded px-3 py-2"
        />
        <button
          type="submit" disabled={busy}
          className="bg-ink-3 rounded px-3 py-2 hover:bg-ink-3/70 disabled:opacity-50"
        >
          {busy ? "Working…" : "Connect Garmin"}
        </button>
      </form>

      {msg && (
        <pre className={`mt-4 whitespace-pre-wrap text-sm ${
          msg.kind === "err" ? "text-magenta" : msg.kind === "mfa" ? "text-warm" : "text-cyan"
        }`}>{msg.text}</pre>
      )}

      {connected && (
        <button
          onClick={onSyncNow} disabled={busy}
          className="mt-6 bg-cyan/20 text-cyan rounded px-3 py-2 disabled:opacity-50"
        >
          Sync now
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify the page renders (dev server)**

Run: `set -a; source .env.local; set +a; npm run dev &` then `sleep 4 && curl -s http://localhost:3000/connect | grep -o "Connect Garmin" | head -1`
Expected: prints `Connect Garmin`. Stop dev server after (`kill %1`).

- [ ] **Step 4: Commit**

```bash
git add app/connect/page.tsx
git commit -m "feat: /connect page — gated Garmin login form + sync-now"
```

---

## Manual verification (after all tasks, at deploy time)

1. `vercel deploy` (preview). Open `<preview>/connect`.
2. Enter access code (`CRON_SECRET`), Garmin email, password → expect "Connected."
   - If "Garmin wants a verification code…" appears, run `python scripts/bootstrap_garmin.py` once (MFA fallback).
3. Click "Sync now" → wait → open `/today`, `/sleep`, `/wellness` → data present.
4. `vercel deploy --prod`.

## Notes for the implementer

- Run pytest with the repo venv: `.venv/bin/python -m pytest tests/py -v` (conftest adds `api/py` to `sys.path`).
- `garth` prints a `DeprecationWarning` on import — expected, not a failure.
- Do **not** add a `pending_logins` table or a two-step MFA endpoint — that path was intentionally dropped (see spec "MFA handling").
- Do **not** add `/connect` to `components/nav/side-nav.tsx` — the page is intentionally unlinked.
