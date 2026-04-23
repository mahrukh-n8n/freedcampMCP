/**
 * MCP Module — Serialization Helpers
 *
 * Strict normalization of unsafe runtime values before they cross the
 * stdio boundary. All handler responses must pass through these helpers.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 */

type Stringable = { toString(): string };

export function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "toString" in value &&
    typeof (value as Stringable).toString === "function" &&
    !(value instanceof Date)
  ) {
    const ctorName = (value as object).constructor?.name;
    if (ctorName && ctorName !== "Object" && ctorName !== "Array") {
      return (value as Stringable).toString();
    }
  }
  return value;
}

export function serializeDeep(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  if (seen.has(value as object)) {
    return "[Circular]";
  }

  if (Array.isArray(value)) {
    seen.add(value);
    const serialized = value.map((entry) => serializeDeep(entry, seen));
    seen.delete(value);
    return serialized;
  }

  if (value instanceof Set) {
    seen.add(value);
    const serialized = Array.from(value, (entry) => serializeDeep(entry, seen));
    seen.delete(value);
    return serialized;
  }

  if (value instanceof Map) {
    seen.add(value);
    const serialized: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      serialized[String(key)] = serializeDeep(entry, seen);
    }
    seen.delete(value);
    return serialized;
  }

  const ctorName = (value as object).constructor?.name;
  if (
    ctorName &&
    ctorName !== "Object" &&
    ctorName !== "Array" &&
    ctorName !== "Map" &&
    ctorName !== "Set" &&
    ctorName !== "Date" &&
    ctorName !== "RegExp"
  ) {
    return (value as Stringable).toString();
  }

  seen.add(value as object);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = serializeDeep(v, seen);
  }
  seen.delete(value as object);
  return result;
}

export function dataResult(payload: unknown): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "data",
    payload: serializeDeep(payload),
  };
}

export function selectionResult(
  payload: unknown,
  options?: {
    choices?: import("../types").McpToolResult["choices"];
    requirements?: import("../types").McpToolResult["requirements"];
    next?: import("../types").McpToolResult["next"];
  }
): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "selection",
    payload: serializeDeep(payload),
    ...options,
  };
}

export function resolutionResult(
  derived: Record<string, unknown>,
  options?: {
    choices?: import("../types").McpToolResult["choices"];
    warnings?: import("../types").McpToolResult["warnings"];
    blockers?: import("../types").McpToolResult["blockers"];
    next?: import("../types").McpToolResult["next"];
  }
): import("../types").McpToolResult {
  return {
    ok: options?.blockers && options.blockers.length > 0 ? false : true,
    kind: options?.blockers && options.blockers.length > 0 ? "blocked" : "resolution",
    derived: serializeDeep(derived) as Record<string, unknown>,
    ...options,
  };
}

export function previewResult(
  derived: Record<string, unknown>,
  options?: {
    warnings?: import("../types").McpToolResult["warnings"];
    blockers?: import("../types").McpToolResult["blockers"];
    next?: import("../types").McpToolResult["next"];
  }
): import("../types").McpToolResult {
  return {
    ok: options?.blockers && options.blockers.length > 0 ? false : true,
    kind: options?.blockers && options.blockers.length > 0 ? "blocked" : "preview",
    derived: serializeDeep(derived) as Record<string, unknown>,
    ...options,
  };
}

export function commitResult(payload: unknown): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "commit",
    payload: serializeDeep(payload),
  };
}

export function approvalResult(pendingApprovalId: number): import("../types").McpToolResult {
  return {
    ok: true,
    kind: "commit",
    payload: {
      approvalRequired: true,
      pendingApprovalId,
    },
    next: [
      {
        tool: "admin.approvalQueue",
        description: "Review the pending approval in /admin/approval-queue",
      },
    ],
  };
}

export function blockedResult(
  blockers: import("../types").McpBlocker[]
): import("../types").McpToolResult {
  return {
    ok: false,
    kind: "blocked",
    blockers,
  };
}

export function errorResult(
  error: string,
  errorCode: import("../types").McpErrorCode
): import("../types").McpToolResult {
  return {
    ok: false,
    kind: "data",
    error,
    errorCode,
  };
}