import { getTodayData } from "@/db/queries/today";
import { HeroNumber } from "@/components/cards/hero-number";
import { MetricCard } from "@/components/cards/metric-card";
import { StatusPill } from "@/components/cards/status-pill";
import { BodyBatteryCurve } from "@/components/charts/body-battery-curve";
import { SleepStagesBar } from "@/components/charts/sleep-stages-bar";
import { fmtInt, fmtMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  let data;
  try {
    data = await getTodayData();
  } catch {
    data = { w: null, s: null, t: null, lastActivities: [] };
  }
  const { w, s, t } = data;

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="grid grid-cols-3 gap-6">
        <HeroNumber value={w?.bodyBatteryWake ?? "–"} label="Body Battery at wake" color="text-lime" />
        <HeroNumber value={s?.garminSleepScore ?? "–"} label="Sleep Score" color="text-cyan" />
        <HeroNumber value={t?.recoveryTimeHours ?? "–"} suffix="h" label="Recovery time" color="text-magenta" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <MetricCard title="Body Battery — today" accent="text-lime">
          <BodyBatteryCurve curve={w?.bodyBatteryCurve as number[][] | null} />
          <div className="flex justify-between text-fg-dim text-xs">
            <span>min {w?.bodyBatteryMin ?? "–"}</span>
            <span>max {w?.bodyBatteryMax ?? "–"}</span>
          </div>
        </MetricCard>

        <MetricCard title="Last night's sleep" accent="text-cyan">
          <div className="text-3xl font-display">{fmtMin(s?.durationTotalSec)}</div>
          <SleepStagesBar
            deep={s?.durationDeepSec ?? 0}
            light={s?.durationLightSec ?? 0}
            rem={s?.durationRemSec ?? 0}
            awake={s?.durationAwakeSec ?? 0}
          />
          <div className="flex justify-between text-fg-dim text-xs">
            <span>deep {fmtMin(s?.durationDeepSec)}</span>
            <span>rem {fmtMin(s?.durationRemSec)}</span>
            <span>light {fmtMin(s?.durationLightSec)}</span>
          </div>
        </MetricCard>

        <MetricCard title="Training" accent="text-magenta">
          <StatusPill status={t?.status ?? null} />
          <div className="flex gap-6 text-sm text-fg-dim mt-2">
            <span>acute load: {t?.acuteLoad?.toFixed(0) ?? "–"}</span>
            <span>chronic: {t?.chronicLoad?.toFixed(0) ?? "–"}</span>
            <span>VO₂max: {t?.vo2Max?.toFixed(1) ?? "–"}</span>
          </div>
        </MetricCard>

        <MetricCard title="Wellness today" accent="text-warm">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-fg-dim text-xs">Steps</div><div className="text-xl">{fmtInt(w?.steps)}</div></div>
            <div><div className="text-fg-dim text-xs">Calories</div><div className="text-xl">{fmtInt(w?.caloriesTotal)}</div></div>
            <div><div className="text-fg-dim text-xs">RHR</div><div className="text-xl">{w?.rhr ?? "–"}</div></div>
            <div><div className="text-fg-dim text-xs">Stress avg</div><div className="text-xl">{w?.stressAvg ?? "–"}</div></div>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}
