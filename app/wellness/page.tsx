import { getWellnessOverview } from "@/db/queries/wellness";
import { MetricCard } from "@/components/cards/metric-card";
import { DeltaBadge } from "@/components/cards/delta-badge";
import { TrendLine } from "@/components/charts/trend-line";
import { deltaOf } from "@/lib/insights/baseline";
import { zoneFor, STRESS_BANDS, type Goodness } from "@/lib/insights/zones";
import { fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";

function CardHeader({
  value,
  delta,
  good,
  valueClass,
}: {
  value: string;
  delta: number | null;
  good: Goodness;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={`text-2xl font-display ${valueClass ?? ""}`}>{value}</span>
      <DeltaBadge delta={delta} good={good} vs="30d avg" />
    </div>
  );
}

export default async function WellnessPage() {
  const { rows, latest, baselines } = await getWellnessOverview();
  const series = rows.map(r => ({
    date: r.date.slice(5),
    rhr: r.rhr,
    steps: r.steps,
    calories: r.caloriesTotal,
    bbWake: r.bodyBatteryWake,
    stress: r.stressAvg,
  }));
  const refLine = (v: number | null, label = "30d avg") =>
    v != null ? { value: v, label } : undefined;
  const stressZone = zoneFor("stress", latest?.stressAvg);
  const bbZone = zoneFor("bodyBattery", latest?.bodyBatteryWake);

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-warm">Wellness</h1>
      <div className="grid grid-cols-2 gap-6">
        <MetricCard title="Resting HR (30d)" accent="text-warm">
          <CardHeader
            value={latest?.rhr != null ? String(latest.rhr) : "–"}
            delta={deltaOf(latest?.rhr, baselines.rhr)}
            good="lower"
          />
          <TrendLine data={series} dataKey="rhr" color="#f5e6c8" unit="bpm" referenceLine={refLine(baselines.rhr)} />
        </MetricCard>
        <MetricCard title="Body Battery at wake (30d)" accent="text-lime">
          <CardHeader
            value={latest?.bodyBatteryWake != null ? String(latest.bodyBatteryWake) : "–"}
            delta={deltaOf(latest?.bodyBatteryWake, baselines.bbWake)}
            good="higher"
            valueClass={bbZone?.textClass}
          />
          <TrendLine data={series} dataKey="bbWake" color="#b6ff39" referenceLine={refLine(baselines.bbWake)} />
        </MetricCard>
        <MetricCard title="Steps (30d)" accent="text-warm">
          <CardHeader
            value={fmtInt(latest?.steps)}
            delta={deltaOf(latest?.steps, baselines.steps)}
            good="higher"
          />
          <TrendLine data={series} dataKey="steps" color="#f5e6c8" referenceLine={refLine(baselines.steps)} />
        </MetricCard>
        <MetricCard title="Calories (30d)" accent="text-warm">
          <CardHeader
            value={fmtInt(latest?.caloriesTotal)}
            delta={deltaOf(latest?.caloriesTotal, baselines.calories)}
            good="neutral"
          />
          <TrendLine data={series} dataKey="calories" color="#f5e6c8" unit="kcal" referenceLine={refLine(baselines.calories)} />
        </MetricCard>
        <MetricCard title="Average stress (30d)" accent="text-amber">
          <CardHeader
            value={latest?.stressAvg != null ? String(latest.stressAvg) : "–"}
            delta={deltaOf(latest?.stressAvg, baselines.stress)}
            good="lower"
            valueClass={stressZone?.textClass}
          />
          <TrendLine
            data={series}
            dataKey="stress"
            color="#ffb84d"
            zoneBands={STRESS_BANDS}
            referenceLine={refLine(baselines.stress)}
          />
        </MetricCard>
      </div>
    </div>
  );
}
