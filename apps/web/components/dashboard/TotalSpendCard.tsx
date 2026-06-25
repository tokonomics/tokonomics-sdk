"use client";

type Props = {
  totalSpendUsd: string;
  projectedMonthlyUsd: string;
  trend: string;
  period: string;
};

export function TotalSpendCard({ totalSpendUsd, projectedMonthlyUsd, trend, period }: Props) {
  const isPositive = trend.startsWith("+") || trend === "+0.0%";
  const trendColor = isPositive ? "text-red-500" : "text-green-600";

  return (
    <div className="rounded-xl border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">Total Spend ({period})</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-bold">${parseFloat(totalSpendUsd).toFixed(2)}</span>
        <span className={`text-sm font-medium ${trendColor}`}>{trend}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Projected this month:{" "}
        <span className="font-semibold text-foreground">
          ${parseFloat(projectedMonthlyUsd).toFixed(2)}
        </span>
      </p>
    </div>
  );
}
