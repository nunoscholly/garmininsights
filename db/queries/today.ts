import { db, dailyWellness, sleepSessions, trainingStatus, activities } from "@/db";
import { eq, desc } from "drizzle-orm";
import { todayBerlin, yesterdayBerlin } from "@/lib/dates";

export async function getTodayData() {
  const today = todayBerlin();
  const yesterday = yesterdayBerlin();

  const [w] = await db.select().from(dailyWellness).where(eq(dailyWellness.date, today)).limit(1);
  const [s] = await db.select().from(sleepSessions).where(eq(sleepSessions.date, yesterday)).limit(1);
  const [t] = await db.select().from(trainingStatus).where(eq(trainingStatus.date, today)).limit(1);
  const lastActivities = await db.select().from(activities).orderBy(desc(activities.startTs)).limit(3);

  return { w, s, t, lastActivities };
}
