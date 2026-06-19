import { PrismaClient, LlmProvider } from "@prisma/client";

const prisma = new PrismaClient();

const MODEL_PRICING = [
  {
    provider: LlmProvider.OPENAI,
    modelId: "gpt-4o",
    modelDisplayName: "GPT-4o",
    inputCostPer1M: "2.500000",
    outputCostPer1M: "10.000000",
  },
  {
    provider: LlmProvider.OPENAI,
    modelId: "gpt-4o-mini",
    modelDisplayName: "GPT-4o mini",
    inputCostPer1M: "0.150000",
    outputCostPer1M: "0.600000",
  },
  {
    provider: LlmProvider.OPENAI,
    modelId: "gpt-4-turbo",
    modelDisplayName: "GPT-4 Turbo",
    inputCostPer1M: "10.000000",
    outputCostPer1M: "30.000000",
  },
  {
    provider: LlmProvider.OPENAI,
    modelId: "gpt-3.5-turbo",
    modelDisplayName: "GPT-3.5 Turbo",
    inputCostPer1M: "0.500000",
    outputCostPer1M: "1.500000",
  },
  {
    provider: LlmProvider.ANTHROPIC,
    modelId: "claude-sonnet-4-6",
    modelDisplayName: "Claude Sonnet 4.6",
    inputCostPer1M: "3.000000",
    outputCostPer1M: "15.000000",
  },
  {
    provider: LlmProvider.ANTHROPIC,
    modelId: "claude-3-5-sonnet-20241022",
    modelDisplayName: "Claude 3.5 Sonnet",
    inputCostPer1M: "3.000000",
    outputCostPer1M: "15.000000",
  },
  {
    provider: LlmProvider.ANTHROPIC,
    modelId: "claude-3-5-haiku-20241022",
    modelDisplayName: "Claude 3.5 Haiku",
    inputCostPer1M: "0.800000",
    outputCostPer1M: "4.000000",
  },
  {
    provider: LlmProvider.ANTHROPIC,
    modelId: "claude-haiku-4-5-20251001",
    modelDisplayName: "Claude Haiku 4.5",
    inputCostPer1M: "0.800000",
    outputCostPer1M: "4.000000",
  },
  {
    provider: LlmProvider.ANTHROPIC,
    modelId: "claude-3-opus-20240229",
    modelDisplayName: "Claude 3 Opus",
    inputCostPer1M: "15.000000",
    outputCostPer1M: "75.000000",
  },
  {
    provider: LlmProvider.GOOGLE,
    modelId: "gemini-1.5-pro",
    modelDisplayName: "Gemini 1.5 Pro",
    inputCostPer1M: "1.250000",
    outputCostPer1M: "5.000000",
  },
  {
    provider: LlmProvider.GOOGLE,
    modelId: "gemini-1.5-flash",
    modelDisplayName: "Gemini 1.5 Flash",
    inputCostPer1M: "0.075000",
    outputCostPer1M: "0.300000",
  },
  {
    provider: LlmProvider.GOOGLE,
    modelId: "gemini-2.0-flash",
    modelDisplayName: "Gemini 2.0 Flash",
    inputCostPer1M: "0.100000",
    outputCostPer1M: "0.400000",
  },
] as const;

async function main(): Promise<void> {
  console.log("Seeding model pricing table...");

  const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");

  for (const model of MODEL_PRICING) {
    await prisma.modelPricing.upsert({
      where: {
        provider_modelId_effectiveFrom: {
          provider: model.provider,
          modelId: model.modelId,
          effectiveFrom,
        },
      },
      update: {
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M,
        modelDisplayName: model.modelDisplayName,
        isActive: true,
      },
      create: {
        provider: model.provider,
        modelId: model.modelId,
        modelDisplayName: model.modelDisplayName,
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M,
        isActive: true,
        effectiveFrom,
      },
    });
  }

  console.log(`Seeded ${MODEL_PRICING.length} model pricing records.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
