import "./globals.css";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { db, ingestRuns } from "@/db";
import { desc } from "drizzle-orm";
import { env } from "@/lib/env";
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
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const allowed = user != null && email === env.ALLOWED_EMAIL;
  const status = allowed ? await getLastRun() : { lastRunAt: null, ok: null };

  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${display.variable} dark`}>
        <body className="min-h-screen bg-ink text-fg antialiased">
          {allowed ? (
            <>
              <SideNav />
              <main className="ml-48 p-8">
                <header className="flex justify-end mb-6">
                  <SyncButton lastRunAt={status.lastRunAt} ok={status.ok} />
                </header>
                {children}
              </main>
            </>
          ) : (
            <main className="p-12 text-fg-dim">
              {user ? "Access denied. This is a private application." : children}
            </main>
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
