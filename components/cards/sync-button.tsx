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
