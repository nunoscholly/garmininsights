import { db, dailyWellness } from "@/db";
import { gte } from "drizzle-orm";
import { baselineOf } from "@/lib/insights/baseline";

const EMPTY_BASELINES = { rhr: null, bbWake: null, steps: null, calories: null, stress: null };

export async function getWellnessOverview() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await db
      .select()
      .from(dailyWellness)
      .where(gte(dailyWellness.date, since.toISOString().slice(0, 10)))
      .orderBy(dailyWellness.date);

    const latest = rows[rows.length - 1] ?? null;
    const prior = rows.slice(0, -1); // exclude latest from its own baseline
    const baselines = {
      rhr: baselineOf(prior.map((r) => r.rhr)),
      bbWake: baselineOf(prior.map((r) => r.bodyBatteryWake)),
      steps: baselineOf(prior.map((r) => r.steps)),
      calories: baselineOf(prior.map((r) => r.caloriesTotal)),
      stress: baselineOf(prior.map((r) => r.stressAvg)),
    };
    return { rows, latest, baselines };
  } catch (error) {
    console.error("Error fetching wellness overview:", error);
    return { rows: [], latest: null, baselines: EMPTY_BASELINES };
  }
}
