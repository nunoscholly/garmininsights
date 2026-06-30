"use client";

export function ConsistencyHeatmap({
  rows,
}: {
  rows: {
    date: string;
    startTs: string | null;
    durationTotalSec: number | null;
  }[];
}) {
  // each row: bedtime hour bucket → cell color intensity
  const cells = rows.map((r) => {
    if (!r.startTs) return { date: r.date, hour: null, intensity: 0 };
    const h = new Date(r.startTs).getHours();
    return { date: r.date, hour: h, intensity: (r.durationTotalSec ?? 0) / (8 * 3600) };
  });
  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((c) => (
        <div
          key={c.date}
          title={`${c.date} bedtime ${c.hour ?? "?"}h`}
          className="aspect-square rounded"
          style={{ background: `rgba(92, 242, 255, ${Math.min(1, c.intensity)})` }}
        />
      ))}
    </div>
  );
}
