/**
 * Email validation utility.
 *
 * Uses a practical regex that covers >99% of real-world emails
 * without the full RFC 5322 complexity.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns true if the string looks like a valid email address. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Validates email and returns a normalized version (trimmed, lowercased).
 * Throws on invalid input.
 */
export function validateAndNormalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) {
    throw new Error(`Invalid email address: "${email}"`);
  }
  return normalized;
}