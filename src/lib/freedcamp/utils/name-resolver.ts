/**
 * Name Resolver — resolves human-readable names to Freedcamp IDs.
 *
 * The LLM often passes names like "Project Alpha" or "alice@example.com"
 * instead of numeric IDs. This module resolves those names before the
 * API call is made.
 *
 * Resolution strategy:
 * 1. If input is a number or numeric string → use as ID directly
 * 2. If input is a non-numeric string → query API, find matching name/email
 * 3. Return first exact match; fall back to first partial match
 */

import type { FreedcampApiClient } from "../api-client";

export interface ResolvedId {
  id: number;
  name: string;
  resolvedFrom: "id" | "exact" | "partial";
}

/**
 * Resolve a project identifier (ID or name) to a project ID.
 * Queries GET /projects if the input is not numeric.
 */
export async function resolveProjectId(
  client: FreedcampApiClient,
  input: number | string
): Promise<ResolvedId | null> {
  if (typeof input === "number") {
    return { id: input, name: String(input), resolvedFrom: "id" };
  }

  const numericId = parseInt(input, 10);
  if (!isNaN(numericId) && String(numericId) === input.trim()) {
    return { id: numericId, name: input, resolvedFrom: "id" };
  }

  // Name lookup — query projects
  const result = await client.request("/projects", {
    method: "GET",
    params: {},
  });

  if (!result.ok || result.kind !== "data") return null;

  const payload = result.payload as { data?: Record<string, unknown>[] };
  const projects = Array.isArray(payload?.data) ? payload.data : [];

  if (projects.length === 0) return null;

  const searchName = input.toLowerCase().trim();

  // Exact match
  const exact = projects.find((p) => {
    const name = String(p.project_name ?? p.name ?? "").toLowerCase().trim();
    return name === searchName;
  });
  if (exact) {
    const id = Number(exact.project_id ?? exact.id ?? 0);
    return { id, name: String(exact.project_name ?? exact.name ?? ""), resolvedFrom: "exact" };
  }

  // Partial match
  const partial = projects.find((p) => {
    const name = String(p.project_name ?? p.name ?? "").toLowerCase().trim();
    return name.includes(searchName);
  });
  if (partial) {
    const id = Number(partial.project_id ?? partial.id ?? 0);
    return { id, name: String(partial.project_name ?? partial.name ?? ""), resolvedFrom: "partial" };
  }

  return null;
}

/**
 * Resolve a user identifier (ID, email, or name) to a user ID.
 * Queries GET /users if the input is not numeric.
 */
export async function resolveUserId(
  client: FreedcampApiClient,
  input: number | string
): Promise<ResolvedId | null> {
  if (typeof input === "number") {
    return { id: input, name: String(input), resolvedFrom: "id" };
  }

  const numericId = parseInt(input, 10);
  if (!isNaN(numericId) && String(numericId) === input.trim()) {
    return { id: numericId, name: input, resolvedFrom: "id" };
  }

  // Name/email lookup — query users
  const result = await client.request("/users", {
    method: "GET",
    params: {},
  });

  if (!result.ok || result.kind !== "data") return null;

  const payload = result.payload as { data?: Record<string, unknown>[] };
  const users = Array.isArray(payload?.data) ? payload.data : [];

  if (users.length === 0) return null;

  const searchTerm = input.toLowerCase().trim();

  // Exact email match
  const exactEmail = users.find((u) => {
    const email = String(u.email ?? "").toLowerCase().trim();
    return email === searchTerm;
  });
  if (exactEmail) {
    const id = Number(exactEmail.id ?? 0);
    return { id, name: String(exactEmail.first_name ?? exactEmail.username ?? ""), resolvedFrom: "exact" };
  }

  // Exact name match
  const exactName = users.find((u) => {
    const fullName = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase().trim();
    const username = String(u.username ?? "").toLowerCase().trim();
    return fullName === searchTerm || username === searchTerm;
  });
  if (exactName) {
    const id = Number(exactName.id ?? 0);
    return { id, name: String(exactName.first_name ?? exactName.username ?? ""), resolvedFrom: "exact" };
  }

  // Partial match (name or email)
  const partial = users.find((u) => {
    const fullName = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase().trim();
    const email = String(u.email ?? "").toLowerCase().trim();
    return fullName.includes(searchTerm) || email.includes(searchTerm);
  });
  if (partial) {
    const id = Number(partial.id ?? 0);
    return { id, name: String(partial.first_name ?? partial.username ?? ""), resolvedFrom: "partial" };
  }

  return null;
}

/**
 * Status name → code bidirectional mapping.
 * Already defined in tasks.ts but centralized here for reuse.
 */
export const STATUS_MAP: Record<string, number> = {
  "not started": 0,
  "in progress": 1,
  completed: 2,
};

export const STATUS_CODE_MAP: Record<number, string> = {
  0: "not started",
  1: "in progress",
  2: "completed",
};

/**
 * Resolve status input to numeric code.
 * Accepts numeric (0/1/2) or string labels ("not started"/"in progress"/"completed").
 */
export function resolveStatus(status: string | number): number {
  if (typeof status === "number") return status;
  const lower = status.toLowerCase().trim();
  if (lower in STATUS_MAP) return STATUS_MAP[lower];
  const parsed = parseInt(status, 10);
  if (!isNaN(parsed)) return parsed;
  throw new Error(`Invalid status: "${status}". Use 0/1/2 or "not started"/"in progress"/"completed"`);
}

/**
 * Convert a status code back to a human-readable label.
 */
export function statusCodeToLabel(code: number): string {
  return STATUS_CODE_MAP[code] ?? String(code);
}