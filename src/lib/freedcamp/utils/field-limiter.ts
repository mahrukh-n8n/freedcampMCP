/**
 * Field limiter — dot-notation field extraction from API responses.
 *
 * Extracts only the requested fields from a raw API response object.
 * Supports dot notation for nested fields: "comments.created_ts"
 * For array responses, filters each element individually.
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
      // If current is an array, map over it
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

function filterObject(obj: unknown, fields: string[]): Record<string, unknown> | null | undefined {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (typeof obj !== "object") return null;

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = getValueByPath(obj, field);
    if (value !== undefined) {
      // Reconstruct nested structure for dot-notation paths
      setNestedValue(result, field, value);
    }
  }
  return result;
}

/**
 * Set a value at a dot-notation path in a nested object.
 * "comments.created_ts" → result.comments.created_ts
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}