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
