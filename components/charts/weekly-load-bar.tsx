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
