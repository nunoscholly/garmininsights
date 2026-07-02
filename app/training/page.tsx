import Link from "next/link";
import { getTrainingOverview } from "@/db/queries/training";
import { MetricCard } from "@/components/cards/metric-card";
import { WeeklyLoadBar } from "@/components/charts/weekly-load-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { StatusPill } from "@/components/cards/status-pill";
import { fmtMin } from "@/lib/format";
import { HrZonesBar } from "@/components/charts/hr-zones-bar";
import { hrZonesFromRawSummary } from "@/lib/insights/hr-zones";
import { trendDirection } from "@/lib/insights/baseline";
import { VO2MAX_TREND_THRESHOLD } from "@/lib/insights/targets";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const { recentActivities, statusHistory, weeklyLoad } = await getTrainingOverview();

  const latestWithTunnel = [...statusHistory]
    .reverse()
    .find((s) => s.loadTunnelMin != null && s.loadTunnelMax != null);
  const tunnel = latestWithTunnel
    ? { min: latestWithTunnel.loadTunnelMin!, max: latestWithTunnel.loadTunnelMax! }
    : null;
  const vo2Dir = trendDirection(statusHistory.map((s) => s.vo2Max), VO2MAX_TREND_THRESHOLD);
  const vo2Arrow = vo2Dir === "up" ? " ▲" : vo2Dir === "down" ? " ▼" : vo2Dir === "flat" ? " →" : "";

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-magenta">Training</h1>

      <MetricCard title="Weekly load (last 8 weeks)" accent="text-magenta">
        <WeeklyLoadBar data={weeklyLoad} tunnel={tunnel} />
        {tunnel && latestWithTunnel?.weeklyTrainingLoad != null && (
          <div className="text-xs text-fg-dim">
            current 7d load {latestWithTunnel.weeklyTrainingLoad.toFixed(0)} · optimal{" "}
            {tunnel.min.toFixed(0)}–{tunnel.max.toFixed(0)}
          </div>
        )}
      </MetricCard>

      <MetricCard title={`VO₂ max trend${vo2Arrow}`} accent="text-magenta">
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
                className="grid grid-cols-6 gap-4 py-3 hover:bg-ink-3 px-2 rounded text-sm items-center"
              >
                <span className="text-fg-dim">
                  {new Date(a.startTs).toLocaleDateString("de-DE")}
                </span>
                <span className="capitalize">{a.type.replace(/_/g, " ")}</span>
                <span>{fmtMin(a.durationSec)}</span>
                <span>{a.distanceM ? (a.distanceM / 1000).toFixed(2) + " km" : "–"}</span>
                <span>HR {a.avgHr ?? "–"}</span>
                <HrZonesBar zones={hrZonesFromRawSummary(a.rawSummary)} compact />
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
