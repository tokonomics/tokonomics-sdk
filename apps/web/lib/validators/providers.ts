import { z } from "zod";

export const createProviderSchema = z.object({
  provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE"]),
  displayName: z.string().min(1).max(100),
  apiKey: z.string().min(10),
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
