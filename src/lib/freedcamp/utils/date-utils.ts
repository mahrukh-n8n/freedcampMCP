/**
 * Date formatting/parsing utilities for Freedcamp API.
 *
 * Freedcamp uses `YYYY-MM-DD HH:MM:SS` format for datetime fields
 * and `YYYY-MM-DD` for date-only fields.
 */

const FC_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;
const FC_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a Freedcamp datetime string into a Date object.
 * Returns null for unparseable input.
 */
export function parseFcDatetime(value: string): Date | null {
  const match = value.match(FC_DATETIME_RE);
  if (!match) return null;

  const [, year, month, day, hour, min, sec] = match;
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(min, 10),
    parseInt(sec, 10)
  );
}

/**
 * Parse a Freedcamp date string (YYYY-MM-DD) into a Date object.
 * Returns null for unparseable input.
 */
export function parseFcDate(value: string): Date | null {
  const match = value.match(FC_DATE_RE);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
}

/**
 * Format a Date into Freedcamp datetime string: YYYY-MM-DD HH:MM:SS
 */
export function formatFcDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Format a Date into Freedcamp date string: YYYY-MM-DD
 */
export function formatFcDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Convert a Freedcamp datetime string to ISO 8601.
 * Returns the original string if parsing fails.
 */
export function fcDatetimeToIso(value: string): string {
  const date = parseFcDatetime(value);
  return date ? date.toISOString() : value;
}