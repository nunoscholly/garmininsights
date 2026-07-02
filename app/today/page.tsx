import { getTodayData } from "@/db/queries/today";
import { HeroNumber } from "@/components/cards/hero-number";
import { MetricCard } from "@/components/cards/metric-card";
import { StatusPill } from "@/components/cards/status-pill";
import { DeltaBadge } from "@/components/cards/delta-badge";
import { BodyBatteryCurve } from "@/components/charts/body-battery-curve";
import { SleepStagesBar } from "@/components/charts/sleep-stages-bar";
import { deltaOf } from "@/lib/insights/baseline";
import { zoneFor } from "@/lib/insights/zones";
import { SLEEP_TARGET_SEC } from "@/lib/insights/targets";
import { fmtInt, fmtMin, fmtSignedMin } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  let data;
  try {
    data = await getTodayData();
  } catch {
    data = {
      w: null, s: null, t: null, lastActivities: [],
      baselines: { bbWake: null, rhr: null, steps: null, calories: null, stress: null, sleepScore: null },
      prevNight: null,
    };
  }
  const { w, s, t, baselines, prevNight } = data;

  const bbZone = zoneFor("bodyBattery", w?.bodyBatteryWake);
  const scoreZone = zoneFor("sleepScore", s?.garminSleepScore);
  const stressZone = zoneFor("stress", w?.stressAvg);
  const sleepPct = Math.min(100, ((s?.durationTotalSec ?? 0) / SLEEP_TARGET_SEC) * 100);

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="grid grid-cols-3 gap-6">
        <HeroNumber
          value={w?.bodyBatteryWake ?? "–"}
          label="Body Battery at wake"
          color={bbZone?.textClass ?? "text-lime"}
          sub={<DeltaBadge delta={deltaOf(w?.bodyBatteryWake, baselines.bbWake)} good="higher" vs="7d avg" />}
        />
        <HeroNumber
          value={s?.garminSleepScore ?? "–"}
          label="Sleep Score"
          color={scoreZone?.textClass ?? "text-cyan"}
          sub={<DeltaBadge delta={deltaOf(s?.garminSleepScore, baselines.sleepScore)} good="higher" vs="7d avg" />}
        />
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
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-display">{fmtMin(s?.durationTotalSec)}</div>
            <DeltaBadge
              delta={deltaOf(s?.durationTotalSec, prevNight?.durationTotalSec)}
              good="higher"
              vs="prev night"
              fmt={fmtSignedMin}
            />
          </div>
          <div className="h-1.5 rounded-full bg-ink-3 overflow-hidden">
            <div className="h-full bg-cyan" style={{ width: `${sleepPct}%` }} />
          </div>
          <div className="text-fg-dim text-xs">vs 8h target</div>
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
            <div>
              <div className="text-fg-dim text-xs">Steps</div>
              <div className="text-xl">{fmtInt(w?.steps)}</div>
              <DeltaBadge delta={deltaOf(w?.steps, baselines.steps)} good="higher" vs="7d avg" />
            </div>
            <div>
              <div className="text-fg-dim text-xs">Calories</div>
              <div className="text-xl">{fmtInt(w?.caloriesTotal)}</div>
              <DeltaBadge delta={deltaOf(w?.caloriesTotal, baselines.calories)} good="neutral" vs="7d avg" />
            </div>
            <div>
              <div className="text-fg-dim text-xs">RHR</div>
              <div className="text-xl">{w?.rhr ?? "–"}</div>
              <DeltaBadge delta={deltaOf(w?.rhr, baselines.rhr)} good="lower" vs="7d avg" />
            </div>
            <div>
              <div className="text-fg-dim text-xs">Stress avg</div>
              <div className={`text-xl ${stressZone?.textClass ?? ""}`}>{w?.stressAvg ?? "–"}</div>
              <DeltaBadge delta={deltaOf(w?.stressAvg, baselines.stress)} good="lower" vs="7d avg" />
            </div>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}
