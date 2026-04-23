import { describe, it, expect } from "vitest";
import { encodeAllParams } from "../lib/freedcamp/api-client";

describe("Multi-value param encoding", () => {
  it("encodes array values with [] suffix producing separate entries", () => {
    const result = encodeAllParams({ status: [0, 2] });
    // URLSearchParams stores duplicate keys
    expect(result.getAll("status[]")).toEqual(["0", "2"]);
  });

  it("encodes single non-array values without suffix", () => {
    const result = encodeAllParams({ project_id: 123 });
    expect(result.get("project_id")).toBe("123");
    expect(result.get("project_id[]")).toBeNull();
  });

  it("encodes pagination params", () => {
    const result = encodeAllParams({}, { limit: 20, offset: 40 });
    expect(result.get("limit")).toBe("20");
    expect(result.get("offset")).toBe("40");
  });

  it("encodes sort params with order[] prefix", () => {
    const result = encodeAllParams({}, undefined, { priority: "asc", due_date: "desc" });
    expect(result.get("order[priority]")).toBe("asc");
    expect(result.get("order[due_date]")).toBe("desc");
  });

  it("skips undefined and null values", () => {
    const result = encodeAllParams({ a: undefined, b: null, c: "value" } as Record<string, unknown>);
    expect(result.get("a")).toBeNull();
    expect(result.get("b")).toBeNull();
    expect(result.get("c")).toBe("value");
  });

  it("combines all param types together", () => {
    const result = encodeAllParams(
      { project_id: 5, assigned_to_id: [1, 2] },
      { limit: 10, offset: 0 },
      { priority: "desc" }
    );
    expect(result.get("project_id")).toBe("5");
    expect(result.get("limit")).toBe("10");
    expect(result.get("offset")).toBe("0");
    expect(result.get("order[priority]")).toBe("desc");
    expect(result.getAll("assigned_to_id[]")).toEqual(["1", "2"]);
  });
});