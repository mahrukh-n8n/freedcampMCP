/**
 * HMAC validator — calls GET /api_key/check at boot to verify credentials.
 */

import { buildAuthParams } from "./hmac";

type ValidationResult =
  | { ok: true; userId: number; apiKey: string }
  | { ok: false; error: string };

const FREEDCAMP_BASE_URL = "https://freedcamp.com";

/**
 * Validate API credentials by calling GET /api_key/check.
 * Returns userId on success or error message on failure.
 */
export async function validateApiKey(
  apiKey: string,
  apiSecret: string,
  baseUrl: string = FREEDCAMP_BASE_URL
): Promise<ValidationResult> {
  const auth = buildAuthParams(apiKey, apiSecret);
  const url = `${baseUrl}/api_key/check?api_key=${encodeURIComponent(auth.api_key)}&timestamp=${encodeURIComponent(auth.timestamp)}&hash=${encodeURIComponent(auth.hash)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "PERMISSION_DENIED: Invalid API key or secret" };
      }
      return { ok: false, error: `API returned status ${res.status}` };
    }

    const body = await res.json() as { data?: { user_id?: number } };
    if (!body.data?.user_id) {
      return { ok: false, error: "PERMISSION_DENIED: No user_id in response" };
    }

    return { ok: true, userId: body.data.user_id, apiKey };
  } catch (err) {
    return {
      ok: false,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}