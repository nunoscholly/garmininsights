import { db, activities, activitySamples, trainingStatus } from "@/db";
import { eq, desc, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function getTrainingOverview() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 56); // 8 weeks

    const recentActivities = await db
      .select()
      .from(activities)
      .where(gte(activities.startTs, since))
      .orderBy(desc(activities.startTs));

    const statusHistory = await db
      .select()
      .from(trainingStatus)
      .where(gte(trainingStatus.date, since.toISOString().slice(0, 10)))
      .orderBy(trainingStatus.date);

    // weekly load aggregation via raw SQL
    const weeklyLoad = await db.execute<{ week: string; load: number }>(sql`
      SELECT to_char(date_trunc('week', start_ts), 'YYYY-MM-DD') AS week,
             COALESCE(SUM(training_load), 0)::float AS load
      FROM activities
      WHERE start_ts >= ${since.toISOString()}
      GROUP BY 1 ORDER BY 1;
    `);

    return { recentActivities, statusHistory, weeklyLoad: weeklyLoad.rows };
  } catch {
    return { recentActivities: [], statusHistory: [], weeklyLoad: [] };
  }
}

export async function getActivity(id: string) {
  try {
    const [a] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, id))
      .limit(1);

    const [samples] = await db
      .select()
      .from(activitySamples)
      .where(eq(activitySamples.activityId, id))
      .limit(1);

    return { a: a ?? null, samples: samples ?? null };
  } catch {
    return { a: null, samples: null };
  }
}
