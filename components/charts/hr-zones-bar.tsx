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
