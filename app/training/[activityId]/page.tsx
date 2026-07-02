import { getActivity } from "@/db/queries/training";
import { MetricCard } from "@/components/cards/metric-card";
import { TrendLine } from "@/components/charts/trend-line";
import { fmtMin, fmtPace } from "@/lib/format";
import { notFound } from "next/navigation";
import { HrZonesBar } from "@/components/charts/hr-zones-bar";
import { hrZonesFromRawSummary } from "@/lib/insights/hr-zones";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;
  const { a, samples } = await getActivity(activityId);
  if (!a) notFound();

  const hrZones = hrZonesFromRawSummary(a.rawSummary);

  const hrSeries = samples?.samples as { ts?: number[]; hr?: number[] } | null;
  const hrData =
    hrSeries?.ts && hrSeries.hr
      ? hrSeries.ts.map((t, i) => ({
          date: new Date(t).toISOString().slice(11, 19),
          hr: hrSeries.hr![i],
        }))
      : [];

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="font-display text-3xl text-magenta capitalize">
        {a.type.replace(/_/g, " ")}
      </h1>
      <div className="text-fg-dim">
        {new Date(a.startTs).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard title="Duration">{fmtMin(a.durationSec)}</MetricCard>
        <MetricCard title="Distance">
          {a.distanceM ? (a.distanceM / 1000).toFixed(2) + " km" : "–"}
        </MetricCard>
        <MetricCard title="Avg HR">{a.avgHr ?? "–"}</MetricCard>
        <MetricCard title="Max HR">{a.maxHr ?? "–"}</MetricCard>
        <MetricCard title="Avg pace">
          {fmtPace(a.distanceM && a.durationSec ? a.distanceM / a.durationSec : null)}
        </MetricCard>
        <MetricCard title="Calories">{a.calories ?? "–"}</MetricCard>
        <MetricCard title="Training effect (aerobic)">
          {a.trainingEffectAerobic?.toFixed(1) ?? "–"}
        </MetricCard>
        <MetricCard title="Training effect (anaerobic)">
          {a.trainingEffectAnaerobic?.toFixed(1) ?? "–"}
        </MetricCard>
      </div>

      {hrZones && (
        <MetricCard title="Time in HR zones" accent="text-magenta">
          <HrZonesBar zones={hrZones} />
        </MetricCard>
      )}

      {hrData.length > 0 && (
        <MetricCard title="Heart rate" accent="text-magenta">
          <TrendLine data={hrData} dataKey="hr" color="#ff4dd2" />
        </MetricCard>
      )}
    </div>
  );
}
