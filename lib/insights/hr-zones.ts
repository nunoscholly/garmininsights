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
