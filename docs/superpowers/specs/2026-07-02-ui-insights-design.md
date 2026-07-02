# UI Insight Layer — Design

**Date:** 2026-07-02
**Status:** Approved
**Goal:** Numbers on the dashboards are hard to interpret. Add context — personal baselines, good/bad zones, day-over-day deltas, and targets — consistently across all four pages (Today, Sleep, Wellness, Training).

## Background / data reality (verified against live Garmin API 2026-07-02)

- **HR time-in-zone** is already in the DB: every `activities.raw_summary` carries `hrTimeInZone_1..5` (seconds per zone). Display-only work.
- **Optimal weekly load range** exists in the aggregated training-status payload: `loadTunnelMin`, `loadTunnelMax`, `weeklyTrainingLoad` under `mostRecentTrainingStatus.latestTrainingStatusData.{deviceId}`. Not yet persisted → small ingest extension.
- **HRV is unavailable**: `/hrv-service/hrv/{date}` returns `null` for the Forerunner 945 (no HRV-status support). Out of scope permanently for this device.
- **Data is sparse**: real data only since 2026-07-01. All baseline-derived UI must degrade gracefully (see Sparse data).

## Architecture

Three layers, no new runtime dependencies (Recharts 3.x already present):

```
lib/insights/           pure functions (zones, baseline, targets)  ← vitest unit tests
components/             DeltaBadge, HrZonesBar, TrendLine upgrades ← consume lib/insights
db/queries/* + schema   baseline aggregates + 3 new training_status columns
api/py/_persist.py      shaper extension for load tunnel fields    ← pytest
```

## Components

### 1. `lib/insights/` (new module, pure TS, no React)

- **`zones.ts`** — per-metric zone definitions using Garmin's own bands:
  - Sleep Score: ≥90 excellent · 80–89 good · 60–79 fair · <60 poor
  - Body Battery: ≥75 high · 50–74 medium · 25–49 low · <25 very low
  - Stress avg: 0–25 rest · 26–50 low · 51–75 medium · 76–100 high
  - Zone → color token mapping (lime / warm/dim / amber / red).
  - `zoneFor(metric, value)` → `{ zone, colorClass }`.
  - Per-metric **goodness direction** (lower RHR = good, higher BB = good, lower stress = good, higher steps = good) so delta arrows color correctly: RHR ▲+4 is red, BB wake ▲+6 is lime.
- **`baseline.ts`** — `baselineOf(values: (number|null)[]): number | null` — mean over the trailing window, **null when fewer than 3 non-null days**. `deltaOf(current, baseline)` → signed delta or null. Null propagates: downstream UI renders nothing.
- **`targets.ts`** — hardcoded personal targets: `SLEEP_TARGET_SEC = 8 * 3600`. (Load tunnel and VO₂max direction come from data, not config.)

### 2. New/updated components

- **`components/cards/delta-badge.tsx`** — inline badge: `▲ +4 vs 7d avg`, `▼ −38min vs last night`. Color = goodness direction × sign. Renders `null` when delta is null.
- **`components/charts/hr-zones-bar.tsx`** — horizontal stacked bar of time in HR zones 1–5 (standard zone gradient gray/blue→red), with per-zone minutes; `compact` variant (no labels) for activity list rows. Input: the five `hrTimeInZone_*` values; renders nothing if all missing/zero.
- **`components/charts/trend-line.tsx`** — gains optional, backward-compatible props:
  - `zoneBands?: { from: number; to: number; color: string }[]` → Recharts `ReferenceArea` backgrounds
  - `referenceLine?: { value: number; label: string }` → dashed `ReferenceLine` (8h target, 30d avg)
  - improved tooltip (formatted value + date)
- **`components/charts/weekly-load-bar.tsx`** — gains optional `tunnel?: { min: number; max: number }` prop → `ReferenceArea` band behind the bars.

### 3. Data layer

- **Schema (Drizzle migration):** `training_status` gains `weekly_training_load real`, `load_tunnel_min real`, `load_tunnel_max real`.
- **Ingest (`api/py/_persist.py`):** `shape_training_status` also extracts `weeklyTrainingLoad`, `loadTunnelMin`, `loadTunnelMax` from the per-device node it already reads. Fixture (real recorded payload) + pytest assertions extended. No new Garmin calls.
- **Queries (`db/queries/*`):** each page query additionally returns the baseline aggregates it needs (SQL `avg()` over trailing 7d/30d **excluding today/last night**, count of contributing days). No new API endpoints; pages stay server components.

## Per-page application

### Today
- Three hero numbers: zone-colored value + DeltaBadge vs 7d baseline.
- Sleep card: duration shown against 8h target (subtle progress fill) + delta vs previous night.
- Wellness card: steps, calories, RHR, stress each get DeltaBadge vs 7d avg; stress value zone-colored.

### Sleep
- Score hero: zone-colored + delta vs 7d avg. Duration hero: vs-8h progress + delta vs previous night.
- 30d duration trend: 8h `referenceLine`.
- Stages card unchanged.

### Wellness
- Each trend card header: latest value + DeltaBadge vs 30d avg.
- Each chart: 30d-avg reference line.
- Stress chart additionally gets Garmin stress zone bands as background.

### Training
- Weekly load chart: load tunnel band + current `weeklyTrainingLoad` readable against it.
- VO₂max card title: 30d direction arrow (▲/▼/→, threshold ±0.5).
- Activities list rows: compact HR-zones bar per row (from `rawSummary`).
- Activity detail page: full HR-zones bar with per-zone minutes. (HR time-series sample chart remains a known follow-up — out of scope.)

## Sparse data handling

Every insight element **degrades to nothing, never to a wrong number**:
- baseline null (<3 days of data) → no badges, no avg lines
- load tunnel null → no band
- missing `hrTimeInZone` keys or all-zero → no zones bar
- Worst case, pages look exactly like the current version.

## Error handling

- Queries keep existing try/catch page behavior; baseline aggregates ride along in the same query, so no new failure modes.
- `rawSummary` zone extraction is defensive (`typeof === "number"` checks) — malformed old rows render nothing.

## Testing

- **vitest** (new dev-dep, no config beyond defaults): unit tests for `lib/insights/` — zone boundaries, baseline min-3-days rule, delta sign/goodness coloring logic. `pnpm test` script added.
- **pytest:** training-status shaper covers the three new fields against the real recorded fixture.
- Components verified visually against production data via local dev server.

## Out of scope

- HRV (device-unsupported), readiness/insight text (`daily_scores` stays reserved for v2), HR sample time-series chart on activity detail, steps target, journal/correlations.
