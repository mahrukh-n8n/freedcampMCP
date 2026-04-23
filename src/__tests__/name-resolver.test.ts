import { describe, it, expect } from "vitest";
import { resolveStatus, statusCodeToLabel, STATUS_MAP, STATUS_CODE_MAP } from "../lib/freedcamp/utils/name-resolver";

describe("Name resolver — status resolution", () => {
  it("resolves string labels to numeric codes", () => {
    expect(resolveStatus("not started")).toBe(0);
    expect(resolveStatus("in progress")).toBe(1);
    expect(resolveStatus("completed")).toBe(2);
  });

  it("passes through numeric values", () => {
    expect(resolveStatus(0)).toBe(0);
    expect(resolveStatus(1)).toBe(1);
    expect(resolveStatus(2)).toBe(2);
  });

  it("resolves case-insensitively", () => {
    expect(resolveStatus("Not Started")).toBe(0);
    expect(resolveStatus("IN PROGRESS")).toBe(1);
    expect(resolveStatus("Completed")).toBe(2);
  });

  it("resolves numeric strings", () => {
    expect(resolveStatus("1")).toBe(1);
    expect(resolveStatus("2")).toBe(2);
  });

  it("throws on invalid status", () => {
    expect(() => resolveStatus("unknown")).toThrow(/Invalid status/);
  });

  it("statusCodeToLabel converts codes to labels", () => {
    expect(statusCodeToLabel(0)).toBe("not started");
    expect(statusCodeToLabel(1)).toBe("in progress");
    expect(statusCodeToLabel(2)).toBe("completed");
    expect(statusCodeToLabel(99)).toBe("99");
  });

  it("STATUS_MAP and STATUS_CODE_MAP are consistent", () => {
    for (const [label, code] of Object.entries(STATUS_MAP)) {
      expect(STATUS_CODE_MAP[code]).toBe(label);
    }
  });
});