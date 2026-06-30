import { db, sleepSessions } from "@/db";
import { desc, gte } from "drizzle-orm";

export async function getSleepOverview() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const rows = await db
      .select()
      .from(sleepSessions)
      .where(gte(sleepSessions.date, since.toISOString().slice(0, 10)))
      .orderBy(desc(sleepSessions.date));

    const lastNight = rows[0] ?? null;
    const need = 8 * 3600; // configurable later
    const debt = rows.reduce(
      (acc, r) => acc + Math.max(0, need - (r.durationTotalSec ?? 0)),
      0
    );
    const avg30 = rows.length
      ? Math.round(
          rows.reduce((a, r) => a + (r.durationTotalSec ?? 0), 0) / rows.length
        )
      : 0;

    return { lastNight, history: rows.slice().reverse(), debt, avg30 };
  } catch (error) {
    console.error("Error fetching sleep overview:", error);
    return { lastNight: null, history: [], debt: 0, avg30: 0 };
  }
}
