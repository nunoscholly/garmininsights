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
