import type { LlmProvider } from "../types/index.js";

type ModelPricingEntry = {
  inputCostPer1M: string;
  outputCostPer1M: string;
};

// Static pricing table — mirrors the model_pricing DB seed.
// Update here + re-seed DB when providers change rates.
const PRICING: Record<string, Record<string, ModelPricingEntry>> = {
  OPENAI: {
    "gpt-4o":          { inputCostPer1M: "2.500000", outputCostPer1M: "10.000000" },
    "gpt-4o-mini":     { inputCostPer1M: "0.150000", outputCostPer1M: "0.600000"  },
    "gpt-4-turbo":     { inputCostPer1M: "10.000000", outputCostPer1M: "30.000000" },
    "gpt-3.5-turbo":   { inputCostPer1M: "0.500000", outputCostPer1M: "1.500000"  },
  },
  ANTHROPIC: {
    "claude-sonnet-4-6":            { inputCostPer1M: "3.000000",  outputCostPer1M: "15.000000" },
    "claude-3-5-sonnet-20241022":   { inputCostPer1M: "3.000000",  outputCostPer1M: "15.000000" },
    "claude-3-5-haiku-20241022":    { inputCostPer1M: "0.800000",  outputCostPer1M: "4.000000"  },
    "claude-haiku-4-5-20251001":    { inputCostPer1M: "0.800000",  outputCostPer1M: "4.000000"  },
    "claude-3-opus-20240229":       { inputCostPer1M: "15.000000", outputCostPer1M: "75.000000" },
  },
  GOOGLE: {
    "gemini-1.5-pro":   { inputCostPer1M: "1.250000", outputCostPer1M: "5.000000"  },
    "gemini-1.5-flash": { inputCostPer1M: "0.075000", outputCostPer1M: "0.300000"  },
    "gemini-2.0-flash": { inputCostPer1M: "0.100000", outputCostPer1M: "0.400000"  },
  },
} satisfies Record<string, Record<string, ModelPricingEntry>>;

export function getModelPricing(
  model: string,
  provider: LlmProvider
): ModelPricingEntry | null {
  return PRICING[provider]?.[model] ?? null;
}

export function calculateEventCost(params: {
  model: string;
  provider: LlmProvider;
  inputTokens: number;
  outputTokens: number;
}): string {
  const pricing = getModelPricing(params.model, params.provider);
  if (!pricing) return "0.000000";

  // Use BigInt arithmetic to avoid floating point drift on large token counts
  const inputCostMicro =
    BigInt(params.inputTokens) * BigInt(Math.round(parseFloat(pricing.inputCostPer1M) * 1_000_000));
  const outputCostMicro =
    BigInt(params.outputTokens) * BigInt(Math.round(parseFloat(pricing.outputCostPer1M) * 1_000_000));

  // Total in micro-dollars (divide by 1M tokens × 1M micro = 1e12)
  const totalMicroDollars = inputCostMicro + outputCostMicro;
  const wholeUsd = totalMicroDollars / BigInt(1_000_000_000_000);
  const remainderMicroDollars = totalMicroDollars % BigInt(1_000_000_000_000);

  // Format to 6 decimal places
  const fractionalStr = remainderMicroDollars.toString().padStart(12, "0").slice(0, 6);
  return `${wholeUsd}.${fractionalStr}`;
}
