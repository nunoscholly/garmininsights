"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export function BodyBatteryCurve({ curve }: { curve: number[][] | null }) {
  if (!curve?.length) return <div className="text-fg-dim text-sm">no data</div>;
  const data = curve.map(([ts, v]) => ({ ts, v }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="bb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b6ff39" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#b6ff39" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="ts" hide />
        <YAxis hide domain={[0, 100]} />
        <Tooltip contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a" }} />
        <Area dataKey="v" stroke="#b6ff39" strokeWidth={2} fill="url(#bb)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
