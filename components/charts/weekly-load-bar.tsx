"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

export function WeeklyLoadBar({ data }: { data: { week: string; load: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, left: 0, right: 0, bottom: 0 }}>
        <XAxis dataKey="week" tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9a9aa3", fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: "#0c0c0e", border: "1px solid #16161a", color: "#f3f3f5" }}
        />
        <Bar dataKey="load" fill="#ff4dd2" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
