import { describe, it, expect } from "vitest";
import {
  parseFcDatetime,
  parseFcDate,
  formatFcDatetime,
  formatFcDate,
  fcDatetimeToIso,
} from "../lib/freedcamp/utils/date-utils";

describe("Freedcamp date utilities", () => {
  describe("parseFcDatetime", () => {
    it("parses YYYY-MM-DD HH:MM:SS format", () => {
      const date = parseFcDatetime("2024-04-23 14:30:00");
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBe(2024);
      expect(date!.getMonth()).toBe(3); // 0-indexed
      expect(date!.getDate()).toBe(23);
      expect(date!.getHours()).toBe(14);
      expect(date!.getMinutes()).toBe(30);
    });

    it("returns null for invalid format", () => {
      expect(parseFcDatetime("not-a-date")).toBeNull();
      expect(parseFcDatetime("2024-04-23")).toBeNull();
      expect(parseFcDatetime("")).toBeNull();
    });
  });

  describe("parseFcDate", () => {
    it("parses YYYY-MM-DD format", () => {
      const date = parseFcDate("2024-04-23");
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBe(2024);
      expect(date!.getMonth()).toBe(3);
      expect(date!.getDate()).toBe(23);
    });

    it("returns null for invalid format", () => {
      expect(parseFcDate("not-a-date")).toBeNull();
      expect(parseFcDate("2024-04-23 14:30:00")).toBeNull();
    });
  });

  describe("formatFcDatetime", () => {
    it("formats Date to YYYY-MM-DD HH:MM:SS", () => {
      const date = new Date(2024, 3, 23, 14, 30, 0);
      expect(formatFcDatetime(date)).toBe("2024-04-23 14:30:00");
    });

    it("zero-pads single-digit values", () => {
      const date = new Date(2024, 0, 5, 9, 5, 3);
      expect(formatFcDatetime(date)).toBe("2024-01-05 09:05:03");
    });
  });

  describe("formatFcDate", () => {
    it("formats Date to YYYY-MM-DD", () => {
      const date = new Date(2024, 3, 23);
      expect(formatFcDate(date)).toBe("2024-04-23");
    });
  });

  describe("fcDatetimeToIso", () => {
    it("converts Freedcamp datetime to ISO 8601", () => {
      const iso = fcDatetimeToIso("2024-04-23 14:30:00");
      // ISO format: YYYY-MM-DDTHH:MM:SS.sssZ
      expect(iso).toMatch(/^2024-04-23T/);
      expect(iso).toContain("Z");
    });

    it("returns original string on parse failure", () => {
      expect(fcDatetimeToIso("invalid")).toBe("invalid");
    });
  });
});