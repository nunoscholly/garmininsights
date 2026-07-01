// app/api/ingest/sync/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "manual";
  // VERCEL_URL is the deployment-specific URL, which sits behind Vercel deployment
  // protection (SSO) — a server-to-server fetch to it gets an HTML login page, not JSON.
  // VERCEL_PROJECT_PRODUCTION_URL is the public production alias, so use it first.
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  const secret = process.env.CRON_SECRET ?? "";
  const res = await fetch(`${base}/api/py/ingest?mode=${mode}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export const GET = POST; // cron uses GET; behave the same
