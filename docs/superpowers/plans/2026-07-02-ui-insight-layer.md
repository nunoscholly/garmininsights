# UI Insight Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interpretive context — personal-baseline deltas, Garmin zone coloring, day-over-day deltas, and targets — to every number and chart across the four dashboards.

**Architecture:** Pure insight math lives in `lib/insights/` (vitest-tested). Small presentational components (`DeltaBadge`, `HrZonesBar`) and backward-compatible prop additions to existing charts consume it. Page queries fetch trailing rows and compute baselines server-side; a 3-column `training_status` extension (Python shaper + Drizzle migration) persists Garmin's load tunnel.

**Tech Stack:** Next.js 16 App Router (server components), Recharts 3.x, Tailwind v4 tokens, Drizzle ORM/kit, Python (Vercel Functions) + pytest, vitest (new dev-dep).

**Spec:** `docs/superpowers/specs/2026-07-02-ui-insights-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (AGENTS.md): breaking changes vs training data — read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js-specific code.
- **No new runtime dependencies.** Recharts 3.x is already present. Only new dev-dep allowed: `vitest`.
- **Degrade to nothing, never to a wrong number:** baseline null (<3 non-null days) → no badge/line; tunnel null → no band; missing `hrTimeInZone_*` or all-zero → no bar. Pages must render exactly like today's version in the worst case.
- **Color tokens** come from `app/globals.css` `@theme`: `text-lime`, `text-cyan`, `text-magenta`, `text-warm`, `text-amber`, `text-red`, `text-fg-dim`, `bg-ink-2/3`. Chart hexes: lime `#b6ff39`, cyan `#5cf2ff`, magenta `#ff4dd2`, warm `#f5e6c8`, amber `#ffb84d`, red `#ff5a5a`, dim `#9a9aa3`.
- **Zone bands (Garmin's own):** Sleep Score ≥90 excellent / 80–89 good / 60–79 fair / <60 poor. Body Battery ≥75 high / 50–74 medium / 25–49 low / <25 very low. Stress 0–25 rest / 26–50 low / 51–75 medium / 76–100 high.
- **Baseline rule:** mean over trailing window (7d Today, 30d trend pages), **excluding the current day/night**, null when <3 non-null values. VO₂max trend threshold: ±0.5.
- **Python:** don't touch `api/py/requirements.txt` (no new deps needed). Run tests with `.venv/bin/python -m pytest tests/py -q`.
- **DB:** `DATABASE_URL` in `.env.local` is the production Neon DB — schema pushes apply to prod. Load env with `set -a; source .env.local; set +a` before any DB-touching command.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
lib/insights/baseline.ts       baselineOf, deltaOf, trendDirection      (Task 1)
lib/insights/zones.ts          zoneFor, deltaTextClass, STRESS_BANDS    (Task 2)
lib/insights/targets.ts        SLEEP_TARGET_SEC, VO2MAX_TREND_THRESHOLD (Task 2)
lib/insights/hr-zones.ts       hrZonesFromRawSummary                    (Task 3)
tests/ts/*.test.ts             vitest unit tests (relative imports)     (Tasks 1–3)
api/py/_persist.py             shaper: 3 new fields                     (Task 4)
db/schema.ts                   3 new training_status columns            (Task 4)
lib/format.ts                  fmtSigned, fmtSignedMin                  (Task 5)
components/cards/delta-badge.tsx  new                                   (Task 5)
components/cards/hero-number.tsx  optional `sub` slot                   (Task 5)
components/charts/trend-line.tsx  zoneBands/referenceLine/unit props    (Task 6)
components/charts/weekly-load-bar.tsx  tunnel prop                      (Task 6)
components/charts/hr-zones-bar.tsx  new                                 (Task 7)
db/queries/today.ts            baselines + prevNight                    (Task 8)
db/queries/wellness.ts         latest + baselines                       (Task 8)
db/queries/sleep.ts            prevNight + scoreBaseline                (Task 8)
app/today/page.tsx             wiring                                   (Task 9)
app/sleep/page.tsx             wiring                                   (Task 10)
app/wellness/page.tsx          wiring                                   (Task 11)
app/training/page.tsx + [activityId]/page.tsx  wiring                   (Task 12)
```

`db/queries/training.ts` needs **no change** — it uses `db.select()` (all columns), so the new `training_status` columns flow through automatically after Task 4.

---

### Task 1: Vitest setup + baseline math

**Files:**
- Create: `lib/insights/baseline.ts`
- Create: `tests/ts/baseline.test.ts`
- Modify: `package.json` (dev-dep + test script)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 8–12):
  - `baselineOf(values: (number | null | undefined)[]): number | null`
  - `deltaOf(current: number | null | undefined, reference: number | null | undefined): number | null`
  - `trendDirection(values: (number | null | undefined)[], threshold: number): "up" | "down" | "flat" | null`

- [ ] **Step 1: Install vitest and add the test script**

```bash
pnpm add -D vitest
```

Then in `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/ts/baseline.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { baselineOf, deltaOf, trendDirection } from "../../lib/insights/baseline";

describe("baselineOf", () => {
  test("mean of non-null values", () => {
    expect(baselineOf([50, 60, 70])).toBe(60);
  });
  test("ignores null/undefined entries", () => {
    expect(baselineOf([50, null, 60, undefined, 70])).toBe(60);
  });
  test("null when fewer than 3 non-null days (sparse-data rule)", () => {
    expect(baselineOf([50, 60])).toBeNull();
    expect(baselineOf([])).toBeNull();
    expect(baselineOf([null, null, 50, 60])).toBeNull();
  });
});

describe("deltaOf", () => {
  test("signed difference", () => {
    expect(deltaOf(54, 50)).toBe(4);
    expect(deltaOf(48, 50)).toBe(-2);
  });
  test("null when either side is missing", () => {
    expect(deltaOf(null, 50)).toBeNull();
    expect(deltaOf(54, null)).toBeNull();
    expect(deltaOf(undefined, undefined)).toBeNull();
  });
});

describe("trendDirection", () => {
  test("up when last - first exceeds threshold", () => {
    expect(trendDirection([58.0, 58.4, 59.0], 0.5)).toBe("up");
  });
  test("down when below negative threshold", () => {
    expect(trendDirection([59.0, 58.0], 0.5)).toBe("down");
  });
  test("flat within threshold", () => {
    expect(trendDirection([59.0, 59.3], 0.5)).toBe("flat");
  });
  test("null with fewer than 2 non-null values", () => {
    expect(trendDirection([59.0], 0.5)).toBeNull();
    expect(trendDirection([null, null], 0.5)).toBeNull();
  });
  test("skips nulls when picking endpoints", () => {
    expect(trendDirection([null, 58.0, null, 59.0, null], 0.5)).toBe("up");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../lib/insights/baseline`.

- [ ] **Step 4: Implement**

Create `lib/insights/baseline.ts`:

```ts
export function baselineOf(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => typeof v === "number");
  if (xs.length < 3) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function deltaOf(
  current: number | null | undefined,
  reference: number | null | undefined,
): number | null {
  if (typeof current !== "number" || typeof reference !== "number") return null;
  return current - reference;
}

export function trendDirection(
  values: (number | null | undefined)[],
  threshold: number,
): "up" | "down" | "flat" | null {
  const xs = values.filter((v): v is number => typeof v === "number");
  if (xs.length < 2) return null;
  const diff = xs[xs.length - 1] - xs[0];
  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "flat";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all baseline tests green).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/insights/baseline.ts tests/ts/baseline.test.ts
git commit -m "feat: baseline/delta/trend math for insight layer (vitest)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Zones, goodness coloring & targets

**Files:**
- Create: `lib/insights/zones.ts`
- Create: `lib/insights/targets.ts`
- Create: `tests/ts/zones.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 5, 9–12):
  - `type ZoneMetric = "sleepScore" | "bodyBattery" | "stress"`
  - `type Zone = { label: string; textClass: string }`
  - `zoneFor(metric: ZoneMetric, value: number | null | undefined): Zone | null`
  - `type Goodness = "higher" | "lower" | "neutral"`
  - `deltaTextClass(delta: number, good: Goodness): string`
  - `STRESS_BANDS: { from: number; to: number; color: string }[]`
  - `SLEEP_TARGET_SEC = 28800`, `VO2MAX_TREND_THRESHOLD = 0.5` (from `targets.ts`)

- [ ] **Step 1: Write the failing tests**

Create `tests/ts/zones.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { zoneFor, deltaTextClass, STRESS_BANDS } from "../../lib/insights/zones";
import { SLEEP_TARGET_SEC, VO2MAX_TREND_THRESHOLD } from "../../lib/insights/targets";

describe("zoneFor — Garmin band boundaries", () => {
  test("sleep score", () => {
    expect(zoneFor("sleepScore", 92)?.label).toBe("excellent");
    expect(zoneFor("sleepScore", 90)?.label).toBe("excellent");
    expect(zoneFor("sleepScore", 89)?.label).toBe("good");
    expect(zoneFor("sleepScore", 80)?.label).toBe("good");
    expect(zoneFor("sleepScore", 79)?.label).toBe("fair");
    expect(zoneFor("sleepScore", 60)?.label).toBe("fair");
    expect(zoneFor("sleepScore", 59)?.label).toBe("poor");
  });
  test("body battery", () => {
    expect(zoneFor("bodyBattery", 75)?.label).toBe("high");
    expect(zoneFor("bodyBattery", 74)?.label).toBe("medium");
    expect(zoneFor("bodyBattery", 50)?.label).toBe("medium");
    expect(zoneFor("bodyBattery", 49)?.label).toBe("low");
    expect(zoneFor("bodyBattery", 24)?.label).toBe("very low");
  });
  test("stress (low value = best tier)", () => {
    expect(zoneFor("stress", 20)).toEqual({ label: "rest", textClass: "text-lime" });
    expect(zoneFor("stress", 26)?.label).toBe("low");
    expect(zoneFor("stress", 51)?.label).toBe("medium");
    expect(zoneFor("stress", 76)).toEqual({ label: "high", textClass: "text-red" });
  });
  test("tier → color mapping (best lime, worst red)", () => {
    expect(zoneFor("sleepScore", 95)?.textClass).toBe("text-lime");
    expect(zoneFor("sleepScore", 85)?.textClass).toBe("text-warm");
    expect(zoneFor("sleepScore", 70)?.textClass).toBe("text-amber");
    expect(zoneFor("sleepScore", 40)?.textClass).toBe("text-red");
  });
  test("null for missing values", () => {
    expect(zoneFor("sleepScore", null)).toBeNull();
    expect(zoneFor("stress", undefined)).toBeNull();
  });
});

describe("deltaTextClass — goodness direction", () => {
  test("higher-is-good: positive lime, negative red", () => {
    expect(deltaTextClass(6, "higher")).toBe("text-lime");
    expect(deltaTextClass(-6, "higher")).toBe("text-red");
  });
  test("lower-is-good: positive red, negative lime (RHR +4 must be red)", () => {
    expect(deltaTextClass(4, "lower")).toBe("text-red");
    expect(deltaTextClass(-4, "lower")).toBe("text-lime");
  });
  test("neutral and zero are dim", () => {
    expect(deltaTextClass(100, "neutral")).toBe("text-fg-dim");
    expect(deltaTextClass(0, "higher")).toBe("text-fg-dim");
  });
});

describe("constants", () => {
  test("stress bands cover 0–100 in Garmin tiers", () => {
    expect(STRESS_BANDS).toHaveLength(4);
    expect(STRESS_BANDS[0]).toEqual({ from: 0, to: 25, color: "#b6ff39" });
    expect(STRESS_BANDS[3]).toEqual({ from: 75, to: 100, color: "#ff5a5a" });
  });
  test("targets", () => {
    expect(SLEEP_TARGET_SEC).toBe(8 * 3600);
    expect(VO2MAX_TREND_THRESHOLD).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../lib/insights/zones`.

- [ ] **Step 3: Implement**

Create `lib/insights/targets.ts`:

```ts
// Personal targets — single-user app, hardcoded by design (spec 2026-07-02).
export const SLEEP_TARGET_SEC = 8 * 3600;
export const VO2MAX_TREND_THRESHOLD = 0.5;
```

Create `lib/insights/zones.ts`:

```ts
export type ZoneMetric = "sleepScore" | "bodyBattery" | "stress";
export type Zone = { label: string; textClass: string };
export type Goodness = "higher" | "lower" | "neutral";

// tier 0 = best … tier 3 = worst
const TIER_CLASSES = ["text-lime", "text-warm", "text-amber", "text-red"] as const;

const ZONES: Record<ZoneMetric, { min: number; max: number; label: string; tier: 0 | 1 | 2 | 3 }[]> = {
  sleepScore: [
    { min: 90, max: 100, label: "excellent", tier: 0 },
    { min: 80, max: 89, label: "good", tier: 1 },
    { min: 60, max: 79, label: "fair", tier: 2 },
    { min: 0, max: 59, label: "poor", tier: 3 },
  ],
  bodyBattery: [
    { min: 75, max: 100, label: "high", tier: 0 },
    { min: 50, max: 74, label: "medium", tier: 1 },
    { min: 25, max: 49, label: "low", tier: 2 },
    { min: 0, max: 24, label: "very low", tier: 3 },
  ],
  stress: [
    { min: 0, max: 25, label: "rest", tier: 0 },
    { min: 26, max: 50, label: "low", tier: 1 },
    { min: 51, max: 75, label: "medium", tier: 2 },
    { min: 76, max: 100, label: "high", tier: 3 },
  ],
};

export function zoneFor(metric: ZoneMetric, value: number | null | undefined): Zone | null {
  if (typeof value !== "number") return null;
  const z = ZONES[metric].find((b) => value >= b.min && value <= b.max);
  return z ? { label: z.label, textClass: TIER_CLASSES[z.tier] } : null;
}

export function deltaTextClass(delta: number, good: Goodness): string {
  if (good === "neutral" || delta === 0) return "text-fg-dim";
  const isGood = good === "higher" ? delta > 0 : delta < 0;
  return isGood ? "text-lime" : "text-red";
}

// Background bands for the stress trend chart (Recharts ReferenceArea fills).
export const STRESS_BANDS = [
  { from: 0, to: 25, color: "#b6ff39" },
  { from: 25, to: 50, color: "#f5e6c8" },
  { from: 50, to: 75, color: "#ffb84d" },
  { from: 75, to: 100, color: "#ff5a5a" },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/insights/zones.ts lib/insights/targets.ts tests/ts/zones.test.ts
git commit -m "feat: Garmin zone bands, goodness coloring, personal targets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: HR-zone extraction from rawSummary

**Files:**
- Create: `lib/insights/hr-zones.ts`
- Create: `tests/ts/hr-zones.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 7, 12): `hrZonesFromRawSummary(raw: unknown): number[] | null` — returns `[z1..z5]` seconds, or null when keys are missing/non-numeric/all zero. Real payload key shape: `hrTimeInZone_1` … `hrTimeInZone_5` (floats, seconds), verified live 2026-07-02.

- [ ] **Step 1: Write the failing tests**

Create `tests/ts/hr-zones.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hrZonesFromRawSummary } from "../../lib/insights/hr-zones";

// shape verified against live /activitylist-service payload 2026-07-02
const REAL = {
  activityId: 123,
  averageHR: 142.0,
  hrTimeInZone_1: 83.387,
  hrTimeInZone_2: 439.026,
  hrTimeInZone_3: 1206.138,
  hrTimeInZone_4: 7.0,
  hrTimeInZone_5: 0.0,
};

describe("hrZonesFromRawSummary", () => {
  test("extracts the five zones in order", () => {
    expect(hrZonesFromRawSummary(REAL)).toEqual([83.387, 439.026, 1206.138, 7.0, 0.0]);
  });
  test("missing keys default to 0", () => {
    expect(hrZonesFromRawSummary({ hrTimeInZone_3: 600 })).toEqual([0, 0, 600, 0, 0]);
  });
  test("null when all zones are zero or absent (degrade to nothing)", () => {
    expect(hrZonesFromRawSummary({ activityId: 1 })).toBeNull();
    expect(hrZonesFromRawSummary({ hrTimeInZone_1: 0, hrTimeInZone_2: 0 })).toBeNull();
  });
  test("null for non-object input", () => {
    expect(hrZonesFromRawSummary(null)).toBeNull();
    expect(hrZonesFromRawSummary("junk")).toBeNull();
  });
  test("non-numeric values treated as 0 (defensive against malformed rows)", () => {
    expect(hrZonesFromRawSummary({ hrTimeInZone_1: "bad", hrTimeInZone_2: 60 })).toEqual([0, 60, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../lib/insights/hr-zones`.

- [ ] **Step 3: Implement**

Create `lib/insights/hr-zones.ts`:

```ts
// activities.raw_summary carries hrTimeInZone_1..5 (seconds) from the
// activitylist-service payload — no ingest change needed to display HR zones.
export function hrZonesFromRawSummary(raw: unknown): number[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const zones = [1, 2, 3, 4, 5].map((i) => {
    const v = r[`hrTimeInZone_${i}`];
    return typeof v === "number" ? v : 0;
  });
  return zones.some((s) => s > 0) ? zones : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/insights/hr-zones.ts tests/ts/hr-zones.test.ts
git commit -m "feat: extract HR time-in-zone from activity rawSummary

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Persist Garmin load tunnel (Python shaper + DB columns)

**Files:**
- Modify: `api/py/_persist.py:62-80` (`shape_training_status`)
- Modify: `tests/py/test_persist.py:35-51`
- Modify: `db/schema.ts:80-89` (`trainingStatus` table)
- Migration: `npx drizzle-kit generate` + `npx drizzle-kit push`

**Interfaces:**
- Consumes: existing fixture `tests/py/fixtures/training_status_2026-06-29.json` — already contains `weeklyTrainingLoad: 512`, `loadTunnelMin: 446`, `loadTunnelMax: 988` (real recorded payload).
- Produces (used by Task 12): `training_status` columns `weekly_training_load`, `load_tunnel_min`, `load_tunnel_max` (all `real`, nullable) → Drizzle fields `weeklyTrainingLoad`, `loadTunnelMin`, `loadTunnelMax` flowing through `getTrainingOverview().statusHistory`.
- Note: the existing `acute_load` mapping (also from `weeklyTrainingLoad`) stays untouched — the Today page reads it.

- [ ] **Step 1: Extend the failing pytest**

In `tests/py/test_persist.py`, extend `test_training_status_shape` (after `assert row["acute_load"] == 512`):

```python
    # Garmin load tunnel (optimal 7-day load range) — spec 2026-07-02
    assert row["weekly_training_load"] == 512
    assert row["load_tunnel_min"] == 446
    assert row["load_tunnel_max"] == 988
```

And extend `test_training_status_shape_empty_payload` (after `assert row["vo2_max"] is None`):

```python
    assert row["weekly_training_load"] is None
    assert row["load_tunnel_min"] is None
    assert row["load_tunnel_max"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/py/test_persist.py -q`
Expected: FAIL — `KeyError: 'weekly_training_load'`.

- [ ] **Step 3: Extend the shaper**

In `api/py/_persist.py`, `shape_training_status`, add three keys to the returned dict (after `"acute_load": dev.get("weeklyTrainingLoad"),`):

```python
        "weekly_training_load": dev.get("weeklyTrainingLoad"),
        "load_tunnel_min": dev.get("loadTunnelMin"),
        "load_tunnel_max": dev.get("loadTunnelMax"),
```

(The `_upsert` helper builds columns from dict keys — no other Python change needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/py -q`
Expected: all tests PASS (17 existing + extended assertions).

- [ ] **Step 5: Add the Drizzle columns**

In `db/schema.ts`, inside `trainingStatus` (after `recoveryTimeHours`):

```ts
  weeklyTrainingLoad: real("weekly_training_load"),
  loadTunnelMin: real("load_tunnel_min"),
  loadTunnelMax: real("load_tunnel_max"),
```

- [ ] **Step 6: Generate and apply the migration (prod DB!)**

```bash
set -a; source .env.local; set +a
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: generate writes a new file under `drizzle/`; push reports adding 3 columns to `training_status`. If push prompts for confirmation of the ALTERs, confirm — they are additive nullable columns, no data loss.

- [ ] **Step 7: Verify the columns exist**

```bash
set -a; source .env.local; set +a
.venv/bin/python -c "
import os, psycopg
with psycopg.connect(os.environ['DATABASE_URL']) as c:
    cols = [r[0] for r in c.execute(\"select column_name from information_schema.columns where table_name='training_status'\")]
    assert {'weekly_training_load','load_tunnel_min','load_tunnel_max'} <= set(cols), cols
    print('OK', sorted(cols))
"
```

Expected: `OK [...]` listing the new columns.

- [ ] **Step 8: Commit**

```bash
git add api/py/_persist.py tests/py/test_persist.py db/schema.ts drizzle/
git commit -m "feat: persist Garmin load tunnel + weekly training load

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Format helpers, DeltaBadge, HeroNumber sub slot

**Files:**
- Modify: `lib/format.ts`
- Create: `components/cards/delta-badge.tsx`
- Modify: `components/cards/hero-number.tsx`
- Create: `tests/ts/format.test.ts`

**Interfaces:**
- Consumes: `deltaTextClass`, `Goodness` from Task 2.
- Produces (used by Tasks 9–12):
  - `fmtSigned(n: number, digits?: number): string` — `"+4"` / `"-2"` / `"+3.7"` with digits=1
  - `fmtSignedMin(sec: number): string` — `"+1h 5m"` / `"−38m"`
  - `<DeltaBadge delta={number|null} good?={"higher"|"lower"|"neutral"} vs={string} fmt?={(n:number)=>string} />` — renders null when `delta` is null
  - `<HeroNumber ... sub?={ReactNode} />` — rendered under the label; existing props unchanged

- [ ] **Step 1: Write the failing format tests**

Create `tests/ts/format.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { fmtSigned, fmtSignedMin } from "../../lib/format";

describe("fmtSigned", () => {
  test("positive gets explicit plus", () => {
    expect(fmtSigned(4)).toBe("+4");
    expect(fmtSigned(3.7, 1)).toBe("+3.7");
  });
  test("negative keeps minus, zero unsigned", () => {
    expect(fmtSigned(-2)).toBe("-2");
    expect(fmtSigned(0)).toBe("0");
  });
  test("rounds to digits", () => {
    expect(fmtSigned(3.7)).toBe("+4");
  });
});

describe("fmtSignedMin", () => {
  test("minutes only", () => {
    expect(fmtSignedMin(-2280)).toBe("−38m");
  });
  test("hours and minutes", () => {
    expect(fmtSignedMin(3900)).toBe("+1h 5m");
  });
  test("zero", () => {
    expect(fmtSignedMin(0)).toBe("0m");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `fmtSigned` is not exported.

- [ ] **Step 3: Implement the format helpers**

Append to `lib/format.ts`:

```ts
export const fmtSigned = (n: number, digits = 0) => {
  const s = n.toFixed(digits);
  return n > 0 && !s.startsWith("-") ? `+${s}` : s;
};

export const fmtSignedMin = (sec: number) => {
  const sign = sec > 0 ? "+" : sec < 0 ? "−" : "";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.round((abs % 3600) / 60);
  return sign + (h ? `${h}h ${m}m` : `${m}m`);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Create DeltaBadge**

Create `components/cards/delta-badge.tsx`:

```tsx
import { deltaTextClass, type Goodness } from "@/lib/insights/zones";
import { fmtSigned } from "@/lib/format";

export function DeltaBadge({
  delta,
  good = "neutral",
  vs,
  fmt = (n) => fmtSigned(n),
}: {
  delta: number | null;
  good?: Goodness;
  vs: string;
  fmt?: (n: number) => string;
}) {
  if (delta === null) return null; // sparse-data rule: no baseline → no badge
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
  return (
    <span className={`inline-flex items-baseline gap-1 text-xs ${deltaTextClass(delta, good)}`}>
      {arrow} {fmt(delta)} <span className="text-fg-dim">vs {vs}</span>
    </span>
  );
}
```

- [ ] **Step 6: Add the `sub` slot to HeroNumber**

Replace `components/cards/hero-number.tsx` with:

```tsx
"use client";
import { motion } from "framer-motion";

export function HeroNumber({ value, label, color, suffix, sub }: {
  value: string | number; label: string; color: string; suffix?: string;
  sub?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="space-y-1"
    >
      <div className={`font-display text-7xl tabular-nums ${color}`}>
        {value}{suffix && <span className="text-3xl ml-1 opacity-60">{suffix}</span>}
      </div>
      <div className="text-fg-dim uppercase tracking-widest text-xs">{label}</div>
      {sub && <div>{sub}</div>}
    </motion.div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/format.ts tests/ts/format.test.ts components/cards/delta-badge.tsx components/cards/hero-number.tsx
git commit -m "feat: DeltaBadge, signed formatters, HeroNumber sub slot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Chart upgrades — TrendLine bands/reference line, WeeklyLoadBar tunnel

**Files:**
- Modify: `components/charts/trend-line.tsx`
- Modify: `components/charts/weekly-load-bar.tsx`

**Interfaces:**
- Consumes: nothing new (Recharts 3.x `ReferenceArea`/`ReferenceLine`).
- Produces (used by Tasks 10–12):
  - `<TrendLine ... zoneBands?={{from,to,color}[]} referenceLine?={{value, label?}} unit?={string} />` — all optional, existing call sites unchanged
  - `<WeeklyLoadBar data={...} tunnel?={{min,max} | null} />`

- [ ] **Step 1: Upgrade TrendLine**

Replace `components/charts/trend-line.tsx` with:

```tsx
"use client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceArea, ReferenceLine,
} from "recharts";

export function TrendLine({
  data,
  dataKey,
  color,
  zoneBands,
  referenceLine,
  unit,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  zoneBands?: { from: number; to: number; color: string }[];
  referenceLine?: { value: number; label?: string };
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        {zoneBands?.map((b) => (
          <ReferenceArea
            key={`${b.from}-${b.to}`}
            y1={b.from}
            y2={b.to}
            fill={b.color}
            fillOpacity={0.07}
            stroke="none"
          />
        ))}
        <XAxis dataKey="date" tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9a9aa3", fontSize: 11 }} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a", color: "#f3f3f5" }}
          formatter={(value: unknown) => [
            `${typeof value === "number" ? Math.round(value * 10) / 10 : String(value)}${unit ? ` ${unit}` : ""}`,
            "",
          ]}
        />
        {referenceLine && (
          <ReferenceLine
            y={referenceLine.value}
            stroke="#9a9aa3"
            strokeDasharray="4 4"
            label={
              referenceLine.label
                ? { value: referenceLine.label, fill: "#9a9aa3", fontSize: 10, position: "insideTopRight" }
                : undefined
            }
          />
        )}
        <Line dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Upgrade WeeklyLoadBar**

Replace `components/charts/weekly-load-bar.tsx` with:

```tsx
"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceArea } from "recharts";

export function WeeklyLoadBar({
  data,
  tunnel,
}: {
  data: { week: string; load: number }[];
  tunnel?: { min: number; max: number } | null;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, left: 0, right: 0, bottom: 0 }}>
        <XAxis dataKey="week" tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <YAxis
          tick={{ fill: "#9a9aa3", fontSize: 11 }}
          domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, tunnel?.max ?? 0) * 1.1)]}
        />
        <Tooltip
          contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a", color: "#f3f3f5" }}
        />
        {tunnel && (
          <ReferenceArea
            y1={tunnel.min}
            y2={tunnel.max}
            fill="#b6ff39"
            fillOpacity={0.08}
            stroke="#b6ff39"
            strokeOpacity={0.25}
            strokeDasharray="4 4"
            label={{ value: "optimal", fill: "#b6ff39", fontSize: 10, position: "insideTopRight" }}
          />
        )}
        <Bar dataKey="load" fill="#ff4dd2" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Typecheck + existing tests still green**

Run: `npx tsc --noEmit && pnpm test`
Expected: no type errors; tests PASS (call sites pass no new props yet — backward compatible).

- [ ] **Step 4: Commit**

```bash
git add components/charts/trend-line.tsx components/charts/weekly-load-bar.tsx
git commit -m "feat: zone bands, reference lines, load tunnel on charts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: HrZonesBar component

**Files:**
- Create: `components/charts/hr-zones-bar.tsx`

**Interfaces:**
- Consumes: `number[] | null` (from `hrZonesFromRawSummary`, Task 3).
- Produces (used by Task 12): `<HrZonesBar zones={number[] | null} compact?={boolean} />` — server component (no hooks/recharts); renders null when `zones` is null. Standard zone colors z1→z5: dim/cyan/lime/amber/red.

- [ ] **Step 1: Implement**

Create `components/charts/hr-zones-bar.tsx`:

```tsx
const ZONE_COLORS = ["#9a9aa3", "#5cf2ff", "#b6ff39", "#ffb84d", "#ff5a5a"];

export function HrZonesBar({ zones, compact = false }: { zones: number[] | null; compact?: boolean }) {
  if (!zones) return null; // sparse-data rule: no zone data → nothing
  const total = zones.reduce((a, b) => a + b, 0);
  return (
    <div className={compact ? "w-24" : "space-y-2"}>
      <div className={`flex w-full overflow-hidden rounded-full bg-ink-3 ${compact ? "h-1.5" : "h-3"}`}>
        {zones.map((sec, i) =>
          sec > 0 ? (
            <div
              key={i}
              style={{ width: `${(sec / total) * 100}%`, background: ZONE_COLORS[i] }}
              title={`Z${i + 1}: ${Math.round(sec / 60)}m`}
            />
          ) : null,
        )}
      </div>
      {!compact && (
        <div className="flex justify-between text-xs text-fg-dim">
          {zones.map((sec, i) => (
            <span key={i}>
              Z{i + 1} {Math.round(sec / 60)}m
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/charts/hr-zones-bar.tsx
git commit -m "feat: HR time-in-zone stacked bar (full + compact)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Query baselines (today, wellness, sleep)

**Files:**
- Modify: `db/queries/today.ts`
- Modify: `db/queries/wellness.ts`
- Modify: `db/queries/sleep.ts`

**Interfaces:**
- Consumes: `baselineOf` (Task 1).
- Produces (used by Tasks 9–11):
  - `getTodayData()` additionally returns `baselines: { bbWake, rhr, steps, calories, stress, sleepScore }` (each `number | null`, 7d trailing, excluding today/last night) and `prevNight` (the sleep row before last night, or null).
  - `getWellnessOverview()` additionally returns `latest` (most recent row or null) and `baselines: { rhr, bbWake, steps, calories, stress }` (30d trailing, excluding the latest row).
  - `getSleepOverview()` additionally returns `prevNight` (row before last night, or null) and `scoreBaseline: number | null` (30d, excluding last night).
- Note: no recovery-time baseline — `recovery_time_hours` is always NULL (aggregated endpoint doesn't carry it; HANDOVER known follow-up).

- [ ] **Step 1: Extend getTodayData**

Replace `db/queries/today.ts` with:

```ts
import { db, dailyWellness, sleepSessions, trainingStatus, activities } from "@/db";
import { eq, desc, lt } from "drizzle-orm";
import { todayBerlin, yesterdayBerlin } from "@/lib/dates";
import { baselineOf } from "@/lib/insights/baseline";

export async function getTodayData() {
  const today = todayBerlin();
  const yesterday = yesterdayBerlin();

  const [w] = await db.select().from(dailyWellness).where(eq(dailyWellness.date, today)).limit(1);
  const [s] = await db.select().from(sleepSessions).where(eq(sleepSessions.date, yesterday)).limit(1);
  const [t] = await db.select().from(trainingStatus).where(eq(trainingStatus.date, today)).limit(1);
  const lastActivities = await db.select().from(activities).orderBy(desc(activities.startTs)).limit(3);

  // Trailing 7 days for baselines — strictly before today / last night,
  // so the current value never contaminates its own reference.
  const wPrev = await db.select().from(dailyWellness)
    .where(lt(dailyWellness.date, today))
    .orderBy(desc(dailyWellness.date)).limit(7);
  const sPrev = await db.select().from(sleepSessions)
    .where(lt(sleepSessions.date, yesterday))
    .orderBy(desc(sleepSessions.date)).limit(7);

  const baselines = {
    bbWake: baselineOf(wPrev.map((r) => r.bodyBatteryWake)),
    rhr: baselineOf(wPrev.map((r) => r.rhr)),
    steps: baselineOf(wPrev.map((r) => r.steps)),
    calories: baselineOf(wPrev.map((r) => r.caloriesTotal)),
    stress: baselineOf(wPrev.map((r) => r.stressAvg)),
    sleepScore: baselineOf(sPrev.map((r) => r.garminSleepScore)),
  };

  return { w, s, t, lastActivities, baselines, prevNight: sPrev[0] ?? null };
}

export type TodayBaselines = Awaited<ReturnType<typeof getTodayData>>["baselines"];
```

- [ ] **Step 2: Extend getWellnessOverview**

Replace `db/queries/wellness.ts` with:

```ts
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
```

- [ ] **Step 3: Extend getSleepOverview**

In `db/queries/sleep.ts`, add the import at the top:

```ts
import { baselineOf } from "@/lib/insights/baseline";
```

Then replace the `return` statement (line 27) and the catch return with:

```ts
    return {
      lastNight,
      history: rows.slice().reverse(),
      debt,
      avg30,
      prevNight: rows[1] ?? null,
      scoreBaseline: baselineOf(rows.slice(1).map((r) => r.garminSleepScore)),
    };
  } catch (error) {
    console.error("Error fetching sleep overview:", error);
    return { lastNight: null, history: [], debt: 0, avg30: 0, prevNight: null, scoreBaseline: null };
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: one error is possible in `app/today/page.tsx` (its catch-fallback object no longer matches the return type). If it errors, that's expected — Task 9 fixes the page; to keep this task green, update the fallback in `app/today/page.tsx:16` now to:

```ts
    data = {
      w: null, s: null, t: null, lastActivities: [],
      baselines: { bbWake: null, rhr: null, steps: null, calories: null, stress: null, sleepScore: null },
      prevNight: null,
    };
```

Re-run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add db/queries/today.ts db/queries/wellness.ts db/queries/sleep.ts app/today/page.tsx
git commit -m "feat: trailing-window baselines in page queries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Today page insights

**Files:**
- Modify: `app/today/page.tsx`

**Interfaces:**
- Consumes: `getTodayData` (Task 8), `zoneFor`, `DeltaBadge`, `HeroNumber sub`, `deltaOf`, `SLEEP_TARGET_SEC`, `fmtSignedMin`.
- Produces: final page — heroes zone-colored with 7d-baseline badges; sleep card 8h progress + prev-night delta; wellness card per-number deltas.

- [ ] **Step 1: Rewrite the page**

Replace `app/today/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && pnpm test`
Expected: clean. Then `pnpm dev`, open `http://localhost:3000/today`: heroes render; with <3 days of data **no badges appear** (correct sparse behavior); sleep progress bar fills proportionally to last night vs 8h.

- [ ] **Step 3: Commit**

```bash
git add app/today/page.tsx
git commit -m "feat: Today page — zone colors, baseline deltas, 8h sleep progress

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Sleep page insights

**Files:**
- Modify: `app/sleep/page.tsx`

**Interfaces:**
- Consumes: `getSleepOverview` (Task 8: `prevNight`, `scoreBaseline`), `zoneFor`, `DeltaBadge`, `HeroNumber sub`, `TrendLine referenceLine`, `SLEEP_TARGET_SEC`, `fmtSignedMin`, `deltaOf`.
- Produces: final page.

- [ ] **Step 1: Update the page**

In `app/sleep/page.tsx`:

Add imports:

```tsx
import { DeltaBadge } from "@/components/cards/delta-badge";
import { deltaOf } from "@/lib/insights/baseline";
import { zoneFor } from "@/lib/insights/zones";
import { SLEEP_TARGET_SEC } from "@/lib/insights/targets";
import { fmtMin, fmtSignedMin } from "@/lib/format";
```

(replacing the existing `fmtMin` import line).

Update the destructuring:

```tsx
const { lastNight, history, debt, avg30, prevNight, scoreBaseline } = await getSleepOverview();
```

Add before `return`:

```tsx
  const scoreZone = zoneFor("sleepScore", lastNight?.garminSleepScore);
  const sleepPct = Math.min(100, ((lastNight?.durationTotalSec ?? 0) / SLEEP_TARGET_SEC) * 100);
```

Replace the first two `HeroNumber`s:

```tsx
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
```

Give the duration trend an 8h target line — replace the `TrendLine` in the "30-day duration trend (h)" card:

```tsx
        <TrendLine
          data={trend}
          dataKey="v"
          color="#5cf2ff"
          unit="h"
          referenceLine={{ value: SLEEP_TARGET_SEC / 3600, label: "8h target" }}
        />
```

Everything else (stages card, heatmap) stays unchanged.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && pnpm test`
Expected: clean. Visual: `/sleep` shows the dashed 8h line on the trend; score hero colored by zone; duration hero shows mini progress bar; prev-night delta appears once 2 nights exist (deltaOf needs both sides, not the 3-day rule — it's a direct comparison, not a baseline).

- [ ] **Step 3: Commit**

```bash
git add app/sleep/page.tsx
git commit -m "feat: Sleep page — zone-colored score, 8h target line, prev-night delta

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Wellness page insights

**Files:**
- Modify: `app/wellness/page.tsx`

**Interfaces:**
- Consumes: `getWellnessOverview` (Task 8: `latest`, `baselines`), `DeltaBadge`, `deltaOf`, `zoneFor`, `TrendLine referenceLine/zoneBands`, `STRESS_BANDS`, `fmtInt`.
- Produces: final page.

- [ ] **Step 1: Rewrite the page**

Replace `app/wellness/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && pnpm test`
Expected: clean. Visual: `/wellness` — each card leads with the latest value; badges/avg-lines hidden until 4+ days of data (3 prior days for the baseline + the latest); stress chart shows faint Garmin zone tinting.

- [ ] **Step 3: Commit**

```bash
git add app/wellness/page.tsx
git commit -m "feat: Wellness page — latest values, 30d-avg deltas and lines, stress zones

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Training pages — load tunnel, VO₂max direction, HR zones

**Files:**
- Modify: `app/training/page.tsx`
- Modify: `app/training/[activityId]/page.tsx`

**Interfaces:**
- Consumes: `statusHistory` rows now carrying `weeklyTrainingLoad`/`loadTunnelMin`/`loadTunnelMax` (Task 4), `WeeklyLoadBar tunnel` (Task 6), `HrZonesBar` (Task 7), `hrZonesFromRawSummary` (Task 3), `trendDirection` (Task 1), `VO2MAX_TREND_THRESHOLD` (Task 2).
- Produces: final pages.

- [ ] **Step 1: Update the training overview page**

In `app/training/page.tsx`, add imports:

```tsx
import { HrZonesBar } from "@/components/charts/hr-zones-bar";
import { hrZonesFromRawSummary } from "@/lib/insights/hr-zones";
import { trendDirection } from "@/lib/insights/baseline";
import { VO2MAX_TREND_THRESHOLD } from "@/lib/insights/targets";
```

After the `getTrainingOverview()` destructuring, add:

```tsx
  const latestWithTunnel = [...statusHistory]
    .reverse()
    .find((s) => s.loadTunnelMin != null && s.loadTunnelMax != null);
  const tunnel = latestWithTunnel
    ? { min: latestWithTunnel.loadTunnelMin!, max: latestWithTunnel.loadTunnelMax! }
    : null;
  const vo2Dir = trendDirection(statusHistory.map((s) => s.vo2Max), VO2MAX_TREND_THRESHOLD);
  const vo2Arrow = vo2Dir === "up" ? " ▲" : vo2Dir === "down" ? " ▼" : vo2Dir === "flat" ? " →" : "";
```

Pass the tunnel to the chart and current week context — replace the "Weekly load" card:

```tsx
      <MetricCard title="Weekly load (last 8 weeks)" accent="text-magenta">
        <WeeklyLoadBar data={weeklyLoad} tunnel={tunnel} />
        {tunnel && latestWithTunnel?.weeklyTrainingLoad != null && (
          <div className="text-xs text-fg-dim">
            current 7d load {latestWithTunnel.weeklyTrainingLoad.toFixed(0)} · optimal{" "}
            {tunnel.min.toFixed(0)}–{tunnel.max.toFixed(0)}
          </div>
        )}
      </MetricCard>
```

Direction arrow on the VO₂max card title:

```tsx
      <MetricCard title={`VO₂ max trend${vo2Arrow}`} accent="text-magenta">
```

Compact HR-zones bar per activity row — the row becomes 6 columns; replace the `<Link>` block inside the activities list:

```tsx
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
```

- [ ] **Step 2: Update the activity detail page**

In `app/training/[activityId]/page.tsx`, add imports:

```tsx
import { HrZonesBar } from "@/components/charts/hr-zones-bar";
import { hrZonesFromRawSummary } from "@/lib/insights/hr-zones";
```

After `if (!a) notFound();` add:

```tsx
  const hrZones = hrZonesFromRawSummary(a.rawSummary);
```

After the metric-card grid (before the `hrData.length > 0` block), add:

```tsx
      {hrZones && (
        <MetricCard title="Time in HR zones" accent="text-magenta">
          <HrZonesBar zones={hrZones} />
        </MetricCard>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && pnpm test`
Expected: clean. Visual: `/training` — lime dashed band on the load chart (tunnel exists only after the next sync ingests it — if absent, the chart looks unchanged, which is the correct degradation); activity rows show mini zone bars (data already in DB); detail page shows the full zone breakdown.

- [ ] **Step 4: Commit**

```bash
git add app/training/page.tsx "app/training/[activityId]/page.tsx"
git commit -m "feat: Training pages — load tunnel band, VO2max direction, HR zone bars

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Full verification + deploy

**Files:** none new — verification, deploy, backfill.

- [ ] **Step 1: Run the full test/lint/build gauntlet**

```bash
pnpm test && .venv/bin/python -m pytest tests/py -q && pnpm lint && pnpm build
```

Expected: vitest green, pytest green, no lint errors, production build succeeds.

- [ ] **Step 2: Visual check against real data**

Run `pnpm dev`, open all five routes: `/today`, `/sleep`, `/wellness`, `/training`, and one activity detail (`/training/<id>` via a row click). Confirm: zone colors on heroes, badges only where ≥3 prior days exist (likely hidden right now — correct), HR zone bars on activity rows + detail, no console errors, nothing rendering `NaN` or a wrong number.

- [ ] **Step 3: Deploy (push to main auto-deploys production)**

```bash
git push
```

Watch: `vercel ls garmininsights` (or the dashboard) until the deployment is READY.

- [ ] **Step 4: Backfill the load tunnel in prod**

```bash
curl -X POST "https://garmininsights.vercel.app/api/ingest/sync?mode=manual"
curl https://garmininsights.vercel.app/api/ingest/status
```

Expected: `{"ok":true,"errors":[]}` (status endpoint shows the latest run ok).

Then verify the tunnel landed:

```bash
set -a; source .env.local; set +a
.venv/bin/python -c "
import os, psycopg
with psycopg.connect(os.environ['DATABASE_URL']) as c:
    print(c.execute('select date, weekly_training_load, load_tunnel_min, load_tunnel_max from training_status order by date desc limit 3').fetchall())
"
```

Expected: latest row has non-null tunnel values.

- [ ] **Step 5: Spot-check production pages**

Open `https://garmininsights.vercel.app/training` — the optimal-load band should now render. Check `/today` and `/wellness` render without errors.

- [ ] **Step 6: Update HANDOVER.md**

In `HANDOVER.md`: add `lib/insights/` and the new components to the file map; note the 3 new `training_status` columns; add `pnpm test` (vitest) to Tooling; remove nothing else.

- [ ] **Step 7: Final commit + push**

```bash
git add HANDOVER.md
git commit -m "docs: handover — insight layer (zones, baselines, load tunnel, HR zones)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```
