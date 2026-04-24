/**
 * HMAC validator — calls GET /sessions/current at boot to verify credentials.
 */

import { buildAuthParams } from "./hmac";

type ValidationResult =
  | { ok: true; userId: number; apiKey: string }
  | { ok: false; error: string };

const FREEDCAMP_BASE_URL = "https://freedcamp.com/api/v1";

/**
 * Validate API credentials by calling GET /sessions/current.
 * Returns the first user's ID from the projects response on success.
 */
export async function validateApiKey(
  apiKey: string,
  apiSecret: string,
  baseUrl: string = FREEDCAMP_BASE_URL
): Promise<ValidationResult> {
  const auth = buildAuthParams(apiKey, apiSecret);
  const url = `${baseUrl}/sessions/current?api_key=${encodeURIComponent(auth.api_key)}&timestamp=${encodeURIComponent(auth.timestamp)}&hash=${encodeURIComponent(auth.hash)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "PERMISSION_DENIED: Invalid API key or secret" };
      }
      return { ok: false, error: `API returned status ${res.status}` };
    }

    const body = await res.json() as { data?: { aa_owner_id?: number | string; projects?: { users?: string[] }[] } };

    // Extract the authenticated user ID from the first project's users list
    const firstProject = body.data?.projects?.[0];
    const userIdStr = firstProject?.users?.[0];
    if (!userIdStr) {
      return { ok: false, error: "PERMISSION_DENIED: No user data in response" };
    }

    return { ok: true, userId: Number(userIdStr), apiKey };
  } catch (err) {
    return {
      ok: false,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}