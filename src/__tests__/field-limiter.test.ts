import { describe, it, expect } from "vitest";
import { applyFieldLimiting, getValueByPath } from "../lib/freedcamp/utils/field-limiter";

describe("Field limiter — dot-notation extraction", () => {
  it("returns full object when fields is undefined", () => {
    const data = { id: 1, name: "Test", nested: { a: 1 } };
    expect(applyFieldLimiting(data)).toEqual(data);
  });

  it("returns full object when fields is empty string", () => {
    const data = { id: 1, name: "Test" };
    expect(applyFieldLimiting(data, "")).toEqual(data);
  });

  it("extracts top-level fields", () => {
    const data = { id: 1, name: "Test", description: "Desc" };
    const result = applyFieldLimiting(data, "id,name");
    expect(result).toEqual({ id: 1, name: "Test" });
  });

  it("extracts nested fields with dot notation", () => {
    const data = { id: 1, nested: { a: 1, b: 2 } };
    const result = applyFieldLimiting(data, "id,nested.a");
    expect(result).toEqual({ id: 1, "nested.a": 1 });
  });

  it("applies field limiting to each element in array", () => {
    const data = [
      { id: 1, name: "A", extra: "x" },
      { id: 2, name: "B", extra: "y" },
    ];
    const result = applyFieldLimiting(data, "id,name");
    expect(result).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });

  it("returns undefined for missing paths", () => {
    const data = { id: 1 };
    const result = applyFieldLimiting(data, "id,missing");
    expect(result).toEqual({ id: 1, missing: undefined });
  });

  it("handles null and undefined data gracefully", () => {
    expect(applyFieldLimiting(null, "id")).toBeNull();
    expect(applyFieldLimiting(undefined, "id")).toBeUndefined();
  });
});

describe("getValueByPath", () => {
  it("resolves top-level keys", () => {
    expect(getValueByPath({ name: "test" }, "name")).toBe("test");
  });

  it("resolves nested paths with dot notation", () => {
    expect(getValueByPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing paths", () => {
    expect(getValueByPath({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined for null/undefined input", () => {
    expect(getValueByPath(null, "a")).toBeUndefined();
    expect(getValueByPath(undefined, "a")).toBeUndefined();
  });
});