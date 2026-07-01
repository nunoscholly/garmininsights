import "./globals.css";
import { Inter, Space_Grotesk } from "next/font/google";
import { db, ingestRuns } from "@/db";
import { desc } from "drizzle-orm";
import { SideNav } from "@/components/nav/side-nav";
import { SyncButton } from "@/components/cards/sync-button";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata = { title: "Garmin Insights" };
export const dynamic = "force-dynamic";

async function getLastRun() {
  try {
    const [row] = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(1);
    return {
      lastRunAt: row ? row.startedAt.toISOString() : null,
      ok: row?.ok ?? null,
    };
  } catch {
    return { lastRunAt: null, ok: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await getLastRun();

  return (
    <html lang="en" className={`${inter.variable} ${display.variable} dark`}>
      <body className="min-h-screen bg-ink text-fg antialiased">
        <SideNav />
        <main className="ml-48 p-8">
          <header className="flex justify-end mb-6">
            <SyncButton lastRunAt={status.lastRunAt} ok={status.ok} />
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
