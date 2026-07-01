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
      const data: Status = await res.json();
      setStatus(data);
      setConnected(data.connected);
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
