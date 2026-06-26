import { describe, it, expect } from "vitest";
import { generateSdkKey, verifySdkKey } from "../sdk-keys";

describe("generateSdkKey", () => {
  it("returns a key starting with tok_live_", () => {
    const { fullKey } = generateSdkKey();
    expect(fullKey).toMatch(/^tok_live_/);
  });

  it("returns unique keys on each call", () => {
    const { fullKey: k1 } = generateSdkKey();
    const { fullKey: k2 } = generateSdkKey();
    expect(k1).not.toBe(k2);
  });

  it("prefix is exactly the first 12 chars of the full key", () => {
    const { fullKey, prefix } = generateSdkKey();
    expect(prefix).toBe(fullKey.slice(0, 12));
  });

  it("prefix length is 12", () => {
    const { prefix } = generateSdkKey();
    expect(prefix.length).toBe(12);
  });

  it("hash is a valid bcrypt hash", () => {
    const { hash } = generateSdkKey();
    expect(hash).toMatch(/^\$2[ab]\$10\$/);
  });

  it("full key is long enough to be unguessable (>= 40 chars)", () => {
    const { fullKey } = generateSdkKey();
    expect(fullKey.length).toBeGreaterThanOrEqual(40);
  });
});

describe("verifySdkKey", () => {
  it("returns true for the correct key", async () => {
    const { fullKey, hash } = generateSdkKey();
    expect(await verifySdkKey(fullKey, hash)).toBe(true);
  });

  it("returns false for a wrong key", async () => {
    const { hash } = generateSdkKey();
    expect(await verifySdkKey("tok_live_wrongkey123456789", hash)).toBe(false);
  });

  it("returns false for empty string", async () => {
    const { hash } = generateSdkKey();
    expect(await verifySdkKey("", hash)).toBe(false);
  });
});
