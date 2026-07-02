import { getSleepOverview } from "@/db/queries/sleep";
import { HeroNumber } from "@/components/cards/hero-number";
import { MetricCard } from "@/components/cards/metric-card";
import { SleepStagesBar } from "@/components/charts/sleep-stages-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { ConsistencyHeatmap } from "@/components/charts/consistency-heatmap";
import { DeltaBadge } from "@/components/cards/delta-badge";
import { deltaOf } from "@/lib/insights/baseline";
import { zoneFor } from "@/lib/insights/zones";
import { SLEEP_TARGET_SEC } from "@/lib/insights/targets";
import { fmtMin, fmtSignedMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SleepPage() {
  const { lastNight, history, debt, avg30, prevNight, scoreBaseline } = await getSleepOverview();
  const trend = history.map((r) => ({
    date: r.date.slice(5),
    v: (r.durationTotalSec ?? 0) / 3600,
  }));
  const scoreZone = zoneFor("sleepScore", lastNight?.garminSleepScore);
  const sleepPct = Math.min(100, ((lastNight?.durationTotalSec ?? 0) / SLEEP_TARGET_SEC) * 100);

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="font-display text-3xl text-cyan">Sleep</h1>

      <div className="grid grid-cols-4 gap-6">
        <HeroNumber
          value={lastNight?.garminSleepScore ?? "–"}
          label="last night score"
          color={scoreZone?.textClass ?? "text-cyan"}
          sub={<DeltaBadge delta={deltaOf(lastNight?.garminSleepScore, scoreBaseline)} good="higher" vs="30d avg" />}
        />
        <HeroNumber
          value={fmtMin(lastNight?.durationTotalSec)}
          label="last night duration"
          color="text-cyan"
          sub={
            <div className="space-y-1">
              <div className="h-1 w-32 rounded-full bg-ink-3 overflow-hidden">
                <div className="h-full bg-cyan" style={{ width: `${sleepPct}%` }} />
              </div>
              <DeltaBadge
                delta={deltaOf(lastNight?.durationTotalSec, prevNight?.durationTotalSec)}
                good="higher"
                vs="prev night"
                fmt={fmtSignedMin}
              />
            </div>
          }
        />
        <HeroNumber
          value={fmtMin(avg30)}
          label="30d average"
          color="text-cyan"
        />
        <HeroNumber
          value={fmtMin(debt)}
          label="30d sleep debt vs 8h"
          color="text-cyan"
        />
      </div>

      <MetricCard title="Last night stages" accent="text-cyan">
        <SleepStagesBar
          deep={lastNight?.durationDeepSec ?? 0}
          light={lastNight?.durationLightSec ?? 0}
          rem={lastNight?.durationRemSec ?? 0}
          awake={lastNight?.durationAwakeSec ?? 0}
        />
        <div className="grid grid-cols-4 gap-4 text-fg-dim text-xs mt-2">
          <span>deep {fmtMin(lastNight?.durationDeepSec)}</span>
          <span>rem {fmtMin(lastNight?.durationRemSec)}</span>
          <span>light {fmtMin(lastNight?.durationLightSec)}</span>
          <span>awake {fmtMin(lastNight?.durationAwakeSec)}</span>
        </div>
        <div className="text-fg-dim text-xs">
          awakenings: {lastNight?.awakeningsCount ?? "–"} · avg HR{" "}
          {lastNight?.avgHr ?? "–"} · resp {lastNight?.avgRespRate?.toFixed(1) ?? "–"} ·
          SpO₂ {lastNight?.avgSpo2 ?? "–"}
        </div>
      </MetricCard>

      <MetricCard title="30-day duration trend (h)" accent="text-cyan">
        <TrendLine
          data={trend}
          dataKey="v"
          color="#5cf2ff"
          unit="h"
          referenceLine={{ value: SLEEP_TARGET_SEC / 3600, label: "8h target" }}
        />
      </MetricCard>

      <MetricCard title="Consistency (last 30 days)" accent="text-cyan">
        <ConsistencyHeatmap
          rows={history.map((r) => ({
            date: r.date,
            startTs: r.startTs as unknown as string | null,
            durationTotalSec: r.durationTotalSec,
          }))}
        />
      </MetricCard>
    </div>
  );
}
