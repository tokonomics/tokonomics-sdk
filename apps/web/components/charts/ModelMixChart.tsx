"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

type ModelData = { model: string; costUsd: string; pct: number; calls: number };

type Props = { data: ModelData[] };

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"];

export function ModelMixChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No model usage data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.model,
    value: parseFloat(d.costUsd),
    pct: d.pct,
  }));

  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Model Mix</h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(2)}`, "Cost"]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-xs text-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
