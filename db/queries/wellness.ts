import { db, dailyWellness } from "@/db";
import { gte } from "drizzle-orm";

export async function getWellnessOverview() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await db
      .select()
      .from(dailyWellness)
      .where(gte(dailyWellness.date, since.toISOString().slice(0, 10)))
      .orderBy(dailyWellness.date);
    return { rows };
  } catch (error) {
    console.error("Error fetching wellness overview:", error);
    return { rows: [] };
  }
}
