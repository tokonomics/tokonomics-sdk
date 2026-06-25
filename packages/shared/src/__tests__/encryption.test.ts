import { describe, it, expect, beforeAll } from "vitest";
import { encryptApiKey, decryptApiKey } from "../encryption";

beforeAll(() => {
  // 64-char hex key required by AES-256-GCM
  process.env["ENCRYPTION_KEY"] = "a".repeat(64);
});

describe("encryptApiKey", () => {
  const testKey = "sk-proj-abcdefghijklmnop1234567890";

  it("returns encryptedValue, iv, authTag, and lastFour", () => {
    const result = encryptApiKey(testKey);
    expect(result.encryptedValue).toBeDefined();
    expect(result.iv).toBeDefined();
    expect(result.authTag).toBeDefined();
    expect(result.lastFour).toBe("7890");
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const enc1 = encryptApiKey(testKey);
    const enc2 = encryptApiKey(testKey);
    expect(enc1.encryptedValue).not.toBe(enc2.encryptedValue);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it("stores iv and authTag as hex strings", () => {
    const result = encryptApiKey(testKey);
    expect(result.iv).toMatch(/^[0-9a-f]+$/);
    expect(result.authTag).toMatch(/^[0-9a-f]+$/);
  });

  it("extracts last 4 chars for display", () => {
    const key = "sk-anthropic-xxxxxxxxxxx1234";
    const result = encryptApiKey(key);
    expect(result.lastFour).toBe("1234");
  });
});

describe("decryptApiKey", () => {
  const testKey = "sk-proj-abcdefghijklmnop1234567890";

  it("decrypts back to original key", () => {
    const encrypted = encryptApiKey(testKey);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(testKey);
  });

  it("round-trips various key formats", () => {
    const keys = [
      "sk-proj-abc123",
      "sk-ant-api03-xxxxxxxxxxx",
      "AIzaSyXXXXXXXXXXXXXXX",
    ];
    for (const key of keys) {
      expect(decryptApiKey(encryptApiKey(key))).toBe(key);
    }
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptApiKey(testKey);
    const tampered = { ...encrypted, encryptedValue: encrypted.encryptedValue.slice(0, -2) + "ff" };
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it("throws on tampered authTag", () => {
    const encrypted = encryptApiKey(testKey);
    const tampered = { ...encrypted, authTag: "deadbeef".repeat(4) };
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it("throws on wrong ENCRYPTION_KEY", () => {
    const encrypted = encryptApiKey(testKey);
    process.env["ENCRYPTION_KEY"] = "b".repeat(64);
    expect(() => decryptApiKey(encrypted)).toThrow();
    process.env["ENCRYPTION_KEY"] = "a".repeat(64); // restore
  });
});
