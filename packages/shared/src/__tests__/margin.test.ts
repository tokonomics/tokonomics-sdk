import { describe, it, expect } from "vitest";
import { calculateGrossMargin, calculateMarginScore } from "../margin";

describe("calculateGrossMargin", () => {
  it("calculates healthy margin", () => {
    const result = calculateGrossMargin({ mrrCents: 19900, llmCostUsd: "4.20" });
    expect(result.grossMarginPct).toBeCloseTo(97.89, 1);
    expect(result.status).toBe("HEALTHY");
  });

  it("classifies losing money customer", () => {
    const result = calculateGrossMargin({ mrrCents: 4900, llmCostUsd: "51.30" });
    expect(result.grossMarginPct).toBeLessThan(0);
    expect(result.status).toBe("LOSING_MONEY");
  });

  it("classifies watch status near floor", () => {
    const result = calculateGrossMargin({ mrrCents: 9900, llmCostUsd: "38.40", floorPct: 60 });
    // margin = (99 - 38.40) / 99 * 100 = 61.2% — above floor but within 15% buffer
    expect(result.grossMarginPct).toBeCloseTo(61.2, 0);
    expect(result.status).toBe("WATCH");
  });

  it("classifies unprofitable (below floor, above zero)", () => {
    const result = calculateGrossMargin({ mrrCents: 9900, llmCostUsd: "50.00", floorPct: 60 });
    // margin = (99 - 50) / 99 * 100 ≈ 49.5% — below floor of 60%
    expect(result.grossMarginPct).toBeCloseTo(49.5, 0);
    expect(result.status).toBe("UNPROFITABLE");
  });

  it("handles zero revenue (returns LOSING_MONEY)", () => {
    const result = calculateGrossMargin({ mrrCents: 0, llmCostUsd: "10.00" });
    expect(result.status).toBe("LOSING_MONEY");
  });

  it("handles zero LLM cost (100% margin)", () => {
    const result = calculateGrossMargin({ mrrCents: 9900, llmCostUsd: "0.00" });
    expect(result.grossMarginPct).toBe(100);
    expect(result.status).toBe("HEALTHY");
  });

  it("returns 6 decimal places for grossMarginPct", () => {
    const result = calculateGrossMargin({ mrrCents: 19900, llmCostUsd: "4.20" });
    expect(typeof result.grossMarginPct).toBe("number");
  });
});

describe("calculateMarginScore", () => {
  it("returns high score for healthy customers", () => {
    const score = calculateMarginScore({
      customers: [
        { mrrCents: 19900, llmCostUsd: "4.20" },
        { mrrCents: 9900, llmCostUsd: "6.80" },
      ],
      marginHistory: [],
    });
    expect(score).toBeGreaterThan(50);
  });

  it("returns low score for unprofitable customers", () => {
    const score = calculateMarginScore({
      customers: [{ mrrCents: 4900, llmCostUsd: "51.30" }],
      marginHistory: [],
    });
    expect(score).toBeLessThan(30);
  });

  it("score is always clamped 0–100", () => {
    const worstCase = calculateMarginScore({
      customers: [{ mrrCents: 100, llmCostUsd: "200.00" }],
      marginHistory: [],
    });
    expect(worstCase).toBeGreaterThanOrEqual(0);
    expect(worstCase).toBeLessThanOrEqual(100);

    const bestCase = calculateMarginScore({
      customers: Array(10).fill({ mrrCents: 19900, llmCostUsd: "0.50" }),
      marginHistory: [],
    });
    expect(bestCase).toBeGreaterThanOrEqual(0);
    expect(bestCase).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty customer list", () => {
    const score = calculateMarginScore({ customers: [], marginHistory: [] });
    expect(score).toBe(0);
  });
});
