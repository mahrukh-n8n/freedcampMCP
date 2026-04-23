import { describe, it, expect } from "vitest";
import { ResolutionCache } from "../lib/freedcamp/utils/resolution-cache";

describe("ResolutionCache", () => {
  it("stores and retrieves values", () => {
    const cache = new ResolutionCache(60000);
    cache.set("test", { value: 42 });
    const result = cache.get<{ value: number }>("test");
    expect(result).toEqual({ value: 42 });
  });

  it("returns undefined for missing keys", () => {
    const cache = new ResolutionCache(60000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries after TTL", async () => {
    const cache = new ResolutionCache(50); // 50ms TTL
    cache.set("short", "data");
    expect(cache.get("short")).toBe("data");

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(cache.get("short")).toBeUndefined();
  });

  it("has() returns false for expired entries", async () => {
    const cache = new ResolutionCache(30);
    cache.set("key", "value");
    expect(cache.has("key")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cache.has("key")).toBe(false);
  });

  it("delete() removes entries", () => {
    const cache = new ResolutionCache(60000);
    cache.set("del", "value");
    expect(cache.delete("del")).toBe(true);
    expect(cache.get("del")).toBeUndefined();
  });

  it("clear() removes all entries", () => {
    const cache = new ResolutionCache(60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("size() excludes expired entries", async () => {
    const cache = new ResolutionCache(30);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cache.size).toBe(0);
  });

  it("static key builders produce consistent format", () => {
    expect(ResolutionCache.projectKey("Project Alpha")).toBe("project:project alpha");
    expect(ResolutionCache.userKey("alice@example.com")).toBe("user:alice@example.com");
    expect(ResolutionCache.projectIdKey(123)).toBe("project_id:123");
    expect(ResolutionCache.userIdKey(456)).toBe("user_id:456");
  });
});