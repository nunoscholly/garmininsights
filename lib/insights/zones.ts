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
  const z = ZONES[metric].find((b) => value >= b.min && value < b.max + 1);
  return z ? { label: z.label, textClass: TIER_CLASSES[z.tier] } : null;
}

export function deltaTextClass(delta: number, good: Goodness): string {
  if (good === "neutral" || delta === 0) return "text-fg-dim";
  const isGood = good === "higher" ? delta > 0 : delta < 0;
  return isGood ? "text-lime" : "text-red";
}

// Background bands for the stress trend chart (Recharts ReferenceArea fills).
// Boundaries deliberately touch (25/50/75) for a continuous fill — unlike the
// discrete ZONES.stress tiers (…-25, 26-50, …) used for point classification.
export const STRESS_BANDS = [
  { from: 0, to: 25, color: "#b6ff39" },
  { from: 25, to: 50, color: "#f5e6c8" },
  { from: 50, to: 75, color: "#ffb84d" },
  { from: 75, to: 100, color: "#ff5a5a" },
];
