import "./globals.css";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SideNav } from "@/components/nav/side-nav";
import { SyncButton } from "@/components/cards/sync-button";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata = { title: "Garmin Insights" };

async function getStatus() {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    const r = await fetch(`${base}/api/ingest/status`, { cache: "no-store" });
    return await r.json();
  } catch {
    return { lastRunAt: null, ok: null, mode: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await getStatus();
  return (
    <ClerkProvider>
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
    </ClerkProvider>
  );
}
