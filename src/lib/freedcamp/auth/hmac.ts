/**
 * HMAC-SHA1 authentication for Freedcamp API.
 *
 * Formula: hash = HMAC-SHA1(secret, apiKey + timestamp)
 * where timestamp is Unix seconds (integer).
 *
 * Auth params are sent as query string on EVERY request:
 *   ?api_key={apiKey}&timestamp={timestamp}&hash={hash}
 */

import { createHmac } from "node:crypto";

export type AuthParams = {
  api_key: string;
  timestamp: string;
  hash: string;
};

/**
 * Compute HMAC-SHA1 hash and return all auth params.
 * The API key and secret come from environment variables.
 */
export function buildAuthParams(apiKey: string, apiSecret: string): AuthParams {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = computeHmac(apiSecret, apiKey, timestamp);
  return { api_key: apiKey, timestamp, hash };
}

/**
 * HMAC-SHA1 hash computation.
 * Order: HMAC-SHA1(secret, apiKey + timestamp)
 */
export function computeHmac(secret: string, apiKey: string, timestamp: string): string {
  return createHmac("sha1", secret).update(apiKey + timestamp).digest("hex");
}