import { describe, it, expect } from "vitest";
import { isValidEmail, validateAndNormalizeEmail } from "../lib/freedcamp/utils/validation";

describe("Email validation", () => {
  it("accepts valid email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user+tag@sub.domain.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@missing-local.com")).toBe(false);
    expect(isValidEmail("missing@.com")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("normalizes and validates email", () => {
    expect(validateAndNormalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("throws on invalid email", () => {
    expect(() => validateAndNormalizeEmail("bad")).toThrow(/Invalid email/);
  });
});