import type { LlmProvider } from "@tokonomics/shared";

type ValidationResult =
  | { valid: true }
  | { valid: false; message: string };

export async function validateProviderKey(
  provider: LlmProvider,
  apiKey: string
): Promise<ValidationResult> {
  try {
    if (provider === "OPENAI") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) return { valid: false, message: "Invalid OpenAI API key" };
      if (!res.ok) return { valid: false, message: `OpenAI returned ${res.status}` };
      return { valid: true };
    }

    if (provider === "ANTHROPIC") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401 || res.status === 403)
        return { valid: false, message: "Invalid Anthropic API key" };
      if (!res.ok) return { valid: false, message: `Anthropic returned ${res.status}` };
      return { valid: true };
    }

    if (provider === "GOOGLE") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.status === 400 || res.status === 403)
        return { valid: false, message: "Invalid Google API key" };
      if (!res.ok) return { valid: false, message: `Google returned ${res.status}` };
      return { valid: true };
    }

    return { valid: false, message: "Unknown provider" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, message: `Connection error: ${msg}` };
  }
}
