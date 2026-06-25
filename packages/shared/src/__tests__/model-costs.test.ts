import { describe, it, expect } from "vitest";
import { calculateEventCost, getModelPricing } from "../pricing/model-costs";

describe("calculateEventCost", () => {
  it("calculates GPT-4o cost correctly", () => {
    const cost = calculateEventCost({
      model: "gpt-4o",
      provider: "OPENAI",
      inputTokens: 1_000,
      outputTokens: 500,
    });
    // Input: 1K × ($2.50/1M) = $0.0025  Output: 500 × ($10.00/1M) = $0.005  Total: $0.0075
    expect(cost).toBe("0.007500");
  });

  it("calculates Claude Haiku cost correctly", () => {
    const cost = calculateEventCost({
      model: "claude-3-5-haiku-20241022",
      provider: "ANTHROPIC",
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    // Input: 10K × ($0.80/1M) = $0.008  Output: 2K × ($4.00/1M) = $0.008  Total: $0.016
    expect(cost).toBe("0.016000");
  });

  it("calculates Gemini Flash cost correctly", () => {
    const cost = calculateEventCost({
      model: "gemini-1.5-flash",
      provider: "GOOGLE",
      inputTokens: 100_000,
      outputTokens: 10_000,
    });
    // Input: 100K × ($0.075/1M) = $0.0075  Output: 10K × ($0.30/1M) = $0.003  Total: $0.0105
    expect(cost).toBe("0.010500");
  });

  it("returns 0.000000 for unknown model", () => {
    const cost = calculateEventCost({
      model: "unknown-model-xyz",
      provider: "OPENAI",
      inputTokens: 1_000,
      outputTokens: 500,
    });
    expect(cost).toBe("0.000000");
  });

  it("handles zero tokens", () => {
    const cost = calculateEventCost({
      model: "gpt-4o",
      provider: "OPENAI",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(cost).toBe("0.000000");
  });

  it("handles large token counts without floating point drift", () => {
    const cost = calculateEventCost({
      model: "gpt-4o",
      provider: "OPENAI",
      inputTokens: 10_000_000,
      outputTokens: 5_000_000,
    });
    // Input: 10M × ($2.50/1M) = $25  Output: 5M × ($10/1M) = $50  Total: $75
    expect(cost).toBe("75.000000");
  });

  it("returns 6 decimal places always", () => {
    const cost = calculateEventCost({
      model: "gpt-4o-mini",
      provider: "OPENAI",
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(cost).toMatch(/^\d+\.\d{6}$/);
  });
});

describe("getModelPricing", () => {
  it("returns correct pricing for gpt-4o", () => {
    const pricing = getModelPricing("gpt-4o", "OPENAI");
    expect(pricing).toEqual({
      inputCostPer1M: "2.500000",
      outputCostPer1M: "10.000000",
    });
  });

  it("returns correct pricing for claude-3-5-haiku", () => {
    const pricing = getModelPricing("claude-3-5-haiku-20241022", "ANTHROPIC");
    expect(pricing).toEqual({
      inputCostPer1M: "0.800000",
      outputCostPer1M: "4.000000",
    });
  });

  it("returns null for unknown model", () => {
    const pricing = getModelPricing("gpt-99-ultra", "OPENAI");
    expect(pricing).toBeNull();
  });

  it("returns null for model from wrong provider", () => {
    const pricing = getModelPricing("gpt-4o", "ANTHROPIC");
    expect(pricing).toBeNull();
  });
});
