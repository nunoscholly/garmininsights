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
