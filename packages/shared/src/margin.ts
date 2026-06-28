import type { MarginStatus } from "./types/index";

export type GrossMarginResult = {
  grossMarginPct: number;
  status: MarginStatus;
};

export function calculateGrossMargin(params: {
  mrrCents: number;
  llmCostUsd: string;
  floorPct?: number;
}): GrossMarginResult {
  const { mrrCents, llmCostUsd, floorPct = 60 } = params;
  const mrrUsd = mrrCents / 100;
  const cost = parseFloat(llmCostUsd);

  if (mrrUsd <= 0 || cost > mrrUsd) {
    return { grossMarginPct: mrrUsd <= 0 ? -Infinity : ((mrrUsd - cost) / mrrUsd) * 100, status: "LOSING_MONEY" };
  }

  const marginPct = ((mrrUsd - cost) / mrrUsd) * 100;

  let status: MarginStatus;
  if (marginPct < 0) {
    status = "LOSING_MONEY";
  } else if (marginPct < floorPct) {
    status = "UNPROFITABLE";
  } else if (marginPct < floorPct + 15) {
    status = "WATCH";
  } else {
    status = "HEALTHY";
  }

  return { grossMarginPct: marginPct, status };
}

export type MarginScoreInput = {
  customers: { mrrCents: number; llmCostUsd: string }[];
  marginHistory: number[]; // last 30 days of org-level margin %, oldest first
};

export function calculateMarginScore(input: MarginScoreInput): number {
  const { customers, marginHistory } = input;
  if (customers.length === 0) return 0;

  // Base score: weighted average margin (0–40 pts)
  const totalMrr = customers.reduce((s, c) => s + c.mrrCents / 100, 0);
  let weightedMarginSum = 0;
  for (const c of customers) {
    const { grossMarginPct } = calculateGrossMargin({ mrrCents: c.mrrCents, llmCostUsd: c.llmCostUsd });
    const weight = totalMrr > 0 ? (c.mrrCents / 100) / totalMrr : 1 / customers.length;
    weightedMarginSum += Math.max(0, Math.min(100, grossMarginPct)) * weight;
  }
  const baseScore = (weightedMarginSum / 100) * 40;

  // Concentration penalty: top-3 revenue concentration (0 to -20 pts)
  const sorted = [...customers].sort((a, b) => b.mrrCents - a.mrrCents);
  const top3Mrr = sorted.slice(0, 3).reduce((s, c) => s + c.mrrCents, 0);
  const concentrationRatio = totalMrr > 0 ? top3Mrr / (totalMrr * 100) : 0;
  const concentrationPenalty = -(concentrationRatio * 20);

  // Waste score: healthy margin customers (0–20 pts)
  const healthyCount = customers.filter(
    (c) => calculateGrossMargin({ mrrCents: c.mrrCents, llmCostUsd: c.llmCostUsd }).status === "HEALTHY"
  ).length;
  const wasteScore = (healthyCount / customers.length) * 20;

  // Pricing fit score: correlation between usage and revenue (0–20 pts)
  // Simplified: customers without zero-revenue get full score
  const revenueCustomers = customers.filter((c) => c.mrrCents > 0).length;
  const pricingFitScore = customers.length > 0 ? (revenueCustomers / customers.length) * 20 : 0;

  // Trend bonus: improving margin over last 30 days (0–10 pts)
  let trendBonus = 0;
  if (marginHistory.length >= 2) {
    const firstHalf = marginHistory.slice(0, Math.floor(marginHistory.length / 2));
    const secondHalf = marginHistory.slice(Math.floor(marginHistory.length / 2));
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    if (avgSecond > avgFirst) trendBonus = Math.min(10, (avgSecond - avgFirst) * 0.5);
  }

  const raw = baseScore + concentrationPenalty + wasteScore + pricingFitScore + trendBonus;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
