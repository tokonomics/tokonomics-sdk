import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

export type GeneratedSdkKey = {
  fullKey: string;  // returned ONCE on creation — user must copy immediately
  prefix: string;   // first 12 chars, stored for display in UI
  hash: string;     // bcrypt hash stored in DB
};

export function generateSdkKey(): GeneratedSdkKey {
  const random = randomBytes(32).toString("base64url");
  const fullKey = `tok_live_${random}`;
  const prefix = fullKey.slice(0, 12);
  const hash = bcrypt.hashSync(fullKey, 10);
  return { fullKey, prefix, hash };
}

// Org-level public API key (tok_api_ prefix — separate from SDK keys)
export function generateOrgApiKey(): GeneratedSdkKey {
  const random = randomBytes(32).toString("base64url");
  const fullKey = `tok_api_${random}`;
  const prefix = fullKey.slice(0, 11); // "tok_api_XXX"
  const hash = bcrypt.hashSync(fullKey, 10);
  return { fullKey, prefix, hash };
}

export async function verifySdkKey(inputKey: string, storedHash: string): Promise<boolean> {
  if (!inputKey) return false;
  try {
    return await bcrypt.compare(inputKey, storedHash);
  } catch {
    return false;
  }
}
