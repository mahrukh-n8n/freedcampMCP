/**
 * MCP Module — App-specific response types
 *
 * These types live alongside the portable module but are app-specific.
 * They describe serializable response shapes used by tool list responses.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 */

export type McpApiKeyRecord = {
  id: number;
  keyPrefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type McpToolListResponse = {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
};

export type McpApiKeyResponse = {
  key: McpApiKeyRecord;
};

export type McpWriteToggleResponse = {
  mcpWritesEnabled: boolean;
};