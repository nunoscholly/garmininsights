import Link from "next/link";
import { getTrainingOverview } from "@/db/queries/training";
import { MetricCard } from "@/components/cards/metric-card";
import { WeeklyLoadBar } from "@/components/charts/weekly-load-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { StatusPill } from "@/components/cards/status-pill";
import { fmtMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const { recentActivities, statusHistory, weeklyLoad } = await getTrainingOverview();

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-magenta">Training</h1>

      <MetricCard title="Weekly load (last 8 weeks)" accent="text-magenta">
        <WeeklyLoadBar data={weeklyLoad} />
      </MetricCard>

      <MetricCard title="VO₂ max trend" accent="text-magenta">
        <TrendLine
          data={statusHistory.map((s) => ({ date: s.date, v: s.vo2Max }))}
          dataKey="v"
          color="#ff4dd2"
        />
      </MetricCard>

      <MetricCard title="Activities" accent="text-magenta">
        <ul className="divide-y divide-ink-3">
          {recentActivities.map((a) => (
            <li key={a.id}>
              <Link
                href={`/training/${a.id}`}
                className="grid grid-cols-5 gap-4 py-3 hover:bg-ink-3 px-2 rounded text-sm"
              >
                <span className="text-fg-dim">
                  {new Date(a.startTs).toLocaleDateString("de-DE")}
                </span>
                <span className="capitalize">{a.type.replace(/_/g, " ")}</span>
                <span>{fmtMin(a.durationSec)}</span>
                <span>{a.distanceM ? (a.distanceM / 1000).toFixed(2) + " km" : "–"}</span>
                <span>HR {a.avgHr ?? "–"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </MetricCard>

      <MetricCard title="Training status timeline" accent="text-magenta">
        <div className="flex flex-wrap gap-2">
          {statusHistory.slice(-14).map((s) => (
            <div key={s.date} className="text-xs">
              <div className="text-fg-dim">{s.date.slice(5)}</div>
              <StatusPill status={s.status ?? null} />
            </div>
          ))}
        </div>
      </MetricCard>
    </div>
  );
}
