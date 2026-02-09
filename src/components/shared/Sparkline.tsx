"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline({
  data,
  color = "#10b981",
  height = 50,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const chartData = data.map((value, i) => ({ value, i }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
