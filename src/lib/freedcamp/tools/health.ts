/**
 * Health check tool — verifies API credentials via GET /api_key/check.
 * Lightweight ping that returns connection status and user info.
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import { dataResult, errorResult } from "../../../modules/mcp/utils/serialize";
import { validateApiKey } from "../auth/hmac-validator";

export const healthCheckSchema = z.object({});

export async function healthCheckHandler(
  apiKey: string,
  apiSecret: string,
  baseUrl?: string
): Promise<McpToolResult> {
  const result = await validateApiKey(apiKey, apiSecret, baseUrl);

  if (!result.ok) {
    return errorResult(result.error, "PERMISSION_DENIED");
  }

  return dataResult({
    ok: true,
    userId: result.userId,
    message: "Freedcamp API connection verified",
  });
}

export const healthCheckTool = {
  name: "health.check",
  description: "Verify Freedcamp API credentials and connection status",
  inputSchema: healthCheckSchema,
  requiredPageKey: "health",
  accessLevel: "READ" as const,
  handler: async (_ctx: unknown, _input: unknown): Promise<McpToolResult> => {
    // Will be replaced during registration with proper API key injection
    return dataResult({ ok: true });
  },
};