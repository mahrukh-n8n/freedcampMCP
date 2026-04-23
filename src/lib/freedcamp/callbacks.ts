/**
 * Freedcamp DI Callbacks — adapts portable MCP module callbacks
 * for the API-key-only (no database) context.
 *
 * - db: void (no database)
 * - apiKeyValidator: calls GET /api_key/check
 * - permissionChecker: all tools accessible (no page-key gating for v1)
 * - approvalRouter: no approval flow (not applicable)
 * - auditWriter: stderr logging (no database audit in v1)
 */

import type { McpServerCallbacks, McpAuditEntry } from "../../modules/mcp/types";
import { validateApiKey } from "./auth/hmac-validator";

export type FreedcampCallbacks = McpServerCallbacks<void>;

/**
 * Create the DI callbacks for the Freedcamp MCP server.
 * Api key and secret come from environment variables.
 */
export async function createCallbacks(
  apiKey: string,
  apiSecret: string,
  baseUrl?: string
): Promise<FreedcampCallbacks> {
  // Validate credentials at boot
  const validation = await validateApiKey(apiKey, apiSecret, baseUrl);
  if (!validation.ok) {
    throw new Error(`Failed to validate Freedcamp API key: ${validation.error}`);
  }

  const callbacks: FreedcampCallbacks = {
    db: undefined as unknown as void,

    apiKeyValidator: async (rawKey: string, _companyId: number) => {
      const result = await validateApiKey(rawKey, apiSecret, baseUrl);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { userId: result.userId, companyId: _companyId };
    },

    permissionChecker: async (_userId: number, _companyId: number) => {
      // v1: all registered tools are accessible to authenticated users
      // No page-key permission gating — return void (READ) or write gate (WRITE)
    },

    approvalRouter: async () => {
      // No approval flow in v1 — writes are immediate
      throw new Error("Approval flow not implemented in v1");
    },

    auditWriter: async (entry: McpAuditEntry) => {
      process.stderr.write(
        `[mcp:audit] ${entry.toolName} ${entry.status} ${entry.durationMs}ms\n`
      );
    },
  };

  return callbacks;
}