/**
 * Field limiter — dot-notation field extraction from API responses.
 *
 * Extracts only the requested fields from a raw API response object.
 * Supports dot notation for nested fields: "comments.created_ts"
 * For array responses, filters each element individually.
 * Preserves array-of-objects structure when extracting nested paths.
 */

/**
 * Resolve a dot-notation path to a value in a nested object.
 * "comments.created_ts" → obj.comments?.created_ts
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      return (current as unknown[]).map((item) => getValueByPath(item, parts.slice(parts.indexOf(part)).join(".")));
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Apply field limiting to a single object or array of objects.
 * If `fields` is empty or undefined, returns the original data unchanged.
 *
 * Fields is a comma-separated string of dot-notation paths:
 *   "id,name,comments.created_ts"
 */
export function applyFieldLimiting(
  data: unknown,
  fields?: string | string[]
): unknown {
  if (!fields || (Array.isArray(fields) && fields.length === 0) || (typeof fields === "string" && fields.trim() === "")) {
    return data;
  }

  const fieldList = typeof fields === "string"
    ? fields.split(",").map((f) => f.trim()).filter(Boolean)
    : fields;

  if (fieldList.length === 0) return data;

  if (Array.isArray(data)) {
    return data.map((item) => filterObject(item, fieldList));
  }

  return filterObject(data, fieldList);
}

/**
 * Filter an object to only include the requested dot-notation fields.
 * Preserves array-of-objects structure: "comments.created_ts" on
 * { comments: [{created_ts: 1, body: ...}] } produces
 * { comments: [{created_ts: 1}] } not { comments: { created_ts: [1] } }
 */
function filterObject(obj: unknown, fields: string[]): Record<string, unknown> | null | undefined {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (typeof obj !== "object") return null;

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const parts = field.split(".");
    pickPath(obj as Record<string, unknown>, parts, 0, result);
  }
  return result;
}

/**
 * Recursively pick a dot-notation path from source into target,
 * preserving arrays of objects along the way.
 */
function pickPath(
  source: Record<string, unknown> | unknown[],
  parts: string[],
  partIndex: number,
  target: Record<string, unknown>
): boolean {
  const key = parts[partIndex];
  const isLast = partIndex === parts.length - 1;

  if (Array.isArray(source)) {
    // Source is an array — recurse into each element
    const items: Record<string, unknown>[] = [];
    for (const item of source) {
      if (item !== null && typeof item === "object") {
        const sub: Record<string, unknown> = {};
        if (pickPath(item as Record<string, unknown>, parts, partIndex, sub)) {
          items.push(sub);
        }
      }
    }
    if (items.length > 0) {
      target[key] = items;
      return true;
    }
    return false;
  }

  if (!(key in source)) return false;
  const value = (source as Record<string, unknown>)[key];

  if (isLast) {
    target[key] = value;
    return true;
  }

  if (Array.isArray(value)) {
    // Need to recurse into the array items for the next path segment
    const items: Record<string, unknown>[] = [];
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        const sub: Record<string, unknown> = {};
        if (pickPath(item as Record<string, unknown>, parts, partIndex + 1, sub)) {
          items.push(sub);
        }
      }
    }
    if (items.length > 0) {
      target[key] = items;
      return true;
    }
    return false;
  }

  if (value !== null && typeof value === "object") {
    // Nested object — create the sub-key in target and recurse
    if (!(key in target)) target[key] = {};
    return pickPath(value as Record<string, unknown>, parts, partIndex + 1, target[key] as Record<string, unknown>);
  }

  return false;
}