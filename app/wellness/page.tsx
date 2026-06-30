import { getWellnessOverview } from "@/db/queries/wellness";
import { MetricCard } from "@/components/cards/metric-card";
import { TrendLine } from "@/components/charts/trend-line";

export const dynamic = "force-dynamic";

export default async function WellnessPage() {
  const { rows } = await getWellnessOverview();
  const series = rows.map(r => ({
    date: r.date.slice(5),
    rhr: r.rhr,
    steps: r.steps,
    calories: r.caloriesTotal,
    bbWake: r.bodyBatteryWake,
    stress: r.stressAvg,
  }));

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-warm">Wellness</h1>
      <div className="grid grid-cols-2 gap-6">
        <MetricCard title="Resting HR (30d)" accent="text-warm"><TrendLine data={series} dataKey="rhr" color="#f5e6c8" /></MetricCard>
        <MetricCard title="Body Battery at wake (30d)" accent="text-lime"><TrendLine data={series} dataKey="bbWake" color="#b6ff39" /></MetricCard>
        <MetricCard title="Steps (30d)" accent="text-warm"><TrendLine data={series} dataKey="steps" color="#f5e6c8" /></MetricCard>
        <MetricCard title="Calories (30d)" accent="text-warm"><TrendLine data={series} dataKey="calories" color="#f5e6c8" /></MetricCard>
        <MetricCard title="Average stress (30d)" accent="text-amber"><TrendLine data={series} dataKey="stress" color="#ffb84d" /></MetricCard>
      </div>
    </div>
  );
}
