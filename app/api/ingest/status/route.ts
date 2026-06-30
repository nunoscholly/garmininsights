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
