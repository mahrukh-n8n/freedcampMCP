import { describe, it, expect } from "vitest";
import { filterResponse } from "../lib/freedcamp/utils/response-filter";

describe("Response filter", () => {
  it("strips internal auth fields from response objects", () => {
    const raw = {
      id: 1,
      name: "Test Project",
      hash: "abc123",
      api_key: "secret",
      timestamp: "1713849600",
    };

    const result = filterResponse({ data: raw });
    const data = result.data as Record<string, unknown>;
    expect(data.id).toBe(1);
    expect(data.name).toBe("Test Project");
    expect(data).not.toHaveProperty("hash");
    expect(data).not.toHaveProperty("api_key");
    expect(data).not.toHaveProperty("timestamp");
  });

  it("strips internal flag fields", () => {
    const raw = {
      id: 5,
      title: "Task",
      f_include_tags: 1,
      f_include_tr_data: 1,
      f_with_archived: 0,
    };

    const result = filterResponse({ data: raw });
    const data = result.data as Record<string, unknown>;
    expect(data.id).toBe(5);
    expect(data.title).toBe("Task");
    expect(data).not.toHaveProperty("f_include_tags");
    expect(data).not.toHaveProperty("f_include_tr_data");
    expect(data).not.toHaveProperty("f_with_archived");
  });

  it("strips internal fields from arrays", () => {
    const raw = [
      { id: 1, name: "A", api_key: "k1" },
      { id: 2, name: "B", timestamp: "123" },
    ];

    const result = filterResponse({ data: raw });
    const data = result.data as Record<string, unknown>[];
    expect(data).toHaveLength(2);
    expect(data[0]).not.toHaveProperty("api_key");
    expect(data[1]).not.toHaveProperty("timestamp");
  });

  it("applies field limiting after stripping internal fields", () => {
    const raw = {
      id: 1,
      name: "Test",
      description: "Desc",
      hash: "abc",
    };

    const result = filterResponse({ data: raw }, "id,name");
    const data = result.data as Record<string, unknown>;
    expect(data).toEqual({ id: 1, name: "Test" });
  });

  it("passes through meta fields correctly", () => {
    const raw = {
      data: [{ id: 1 }],
      meta: { total_count: 100, has_more: true },
    };

    const result = filterResponse(raw);
    expect(result.meta.total_count).toBe(100);
    expect(result.meta.has_more).toBe(true);
  });

  it("handles null/undefined responses gracefully", () => {
    const result1 = filterResponse(null);
    expect(result1.data).toBeNull();

    const result2 = filterResponse(undefined);
    expect(result2.data).toBeUndefined();
  });
});