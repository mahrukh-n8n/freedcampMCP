import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { computeHmac, buildAuthParams } from "../lib/freedcamp/auth/hmac";

describe("HMAC-SHA1 signing", () => {
  it("produces deterministic hash for same inputs", () => {
    const hash1 = computeHmac("secret123", "myApiKey", "1713849600");
    const hash2 = computeHmac("secret123", "myApiKey", "1713849600");
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different timestamps", () => {
    const hash1 = computeHmac("secret123", "myApiKey", "1713849600");
    const hash2 = computeHmac("secret123", "myApiKey", "1713849601");
    expect(hash1).not.toBe(hash2);
  });

  it("produces different hash for different API keys", () => {
    const hash1 = computeHmac("secret123", "key1", "1713849600");
    const hash2 = computeHmac("secret123", "key2", "1713849600");
    expect(hash1).not.toBe(hash2);
  });

  it("uses apiKey + timestamp order in HMAC input (not timestamp + apiKey)", () => {
    // Per n8n reference: hash = HMAC-SHA1(secret, apiKey + timestamp)
    const result = computeHmac("secret123", "abc", "100");
    const expected = createHmac("sha1", "secret123").update("abc100").digest("hex");
    expect(result).toBe(expected);
  });

  it("buildAuthParams returns all three auth fields", () => {
    const result = buildAuthParams("testApiKey", "testSecret");
    expect(result).toHaveProperty("api_key", "testApiKey");
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("hash");
    expect(result.timestamp).toMatch(/^\d+$/);
    expect(result.hash).toHaveLength(40); // SHA1 hex is 40 chars
  });
});