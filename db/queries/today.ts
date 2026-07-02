import { db, dailyWellness, sleepSessions, trainingStatus, activities } from "@/db";
import { eq, desc, lt } from "drizzle-orm";
import { todayBerlin, yesterdayBerlin } from "@/lib/dates";
import { baselineOf } from "@/lib/insights/baseline";

export async function getTodayData() {
  const today = todayBerlin();
  const yesterday = yesterdayBerlin();

  const [w] = await db.select().from(dailyWellness).where(eq(dailyWellness.date, today)).limit(1);
  const [s] = await db.select().from(sleepSessions).where(eq(sleepSessions.date, yesterday)).limit(1);
  const [t] = await db.select().from(trainingStatus).where(eq(trainingStatus.date, today)).limit(1);
  const lastActivities = await db.select().from(activities).orderBy(desc(activities.startTs)).limit(3);

  // Trailing 7 days for baselines — strictly before today / last night,
  // so the current value never contaminates its own reference.
  const wPrev = await db.select().from(dailyWellness)
    .where(lt(dailyWellness.date, today))
    .orderBy(desc(dailyWellness.date)).limit(7);
  const sPrev = await db.select().from(sleepSessions)
    .where(lt(sleepSessions.date, yesterday))
    .orderBy(desc(sleepSessions.date)).limit(7);

  const baselines = {
    bbWake: baselineOf(wPrev.map((r) => r.bodyBatteryWake)),
    rhr: baselineOf(wPrev.map((r) => r.rhr)),
    steps: baselineOf(wPrev.map((r) => r.steps)),
    calories: baselineOf(wPrev.map((r) => r.caloriesTotal)),
    stress: baselineOf(wPrev.map((r) => r.stressAvg)),
    sleepScore: baselineOf(sPrev.map((r) => r.garminSleepScore)),
  };

  return { w, s, t, lastActivities, baselines, prevNight: sPrev[0] ?? null };
}

export type TodayBaselines = Awaited<ReturnType<typeof getTodayData>>["baselines"];
