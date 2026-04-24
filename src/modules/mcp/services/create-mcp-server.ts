/**
 * MCP Module — Server Dispatch Loop
 *
 * Creates the portable MCP server using only injected callbacks.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 */

import type {
  McpServerCallbacks,
  McpSessionContext,
  McpToolResult,
  McpWriteGateResult,
  McpToolDefinition,
} from "../types";
import type { ToolRegistry } from "../registry/tool-registry";
import { serializeDeep, errorResult, approvalResult } from "../utils/serialize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = McpToolDefinition<any>;

export type McpServer = {
  handleListTools(): Promise<McpListToolsResponse>;
  handleCallTool(params: McpCallToolParams): Promise<McpToolResult>;
};

export type McpListToolsResponse = {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
};

export type McpCallToolParams = {
  name: string;
  arguments?: Record<string, unknown>;
  signal?: AbortSignal;
};

/**
 * Create the portable MCP server dispatch loop.
 * All app-specific behavior flows through the injected callbacks.
 */
export function createMcpServer<TDb = unknown>(
  session: McpSessionContext,
  registry: ToolRegistry,
  callbacks: McpServerCallbacks<TDb>
): McpServer {
  const { userId, companyId } = session;

  return {
    async handleListTools(): Promise<McpListToolsResponse> {
      const tools: McpListToolsResponse["tools"] = [];

      for (const tool of registry.all() as ReadonlyArray<AnyTool>) {
        try {
          await callbacks.permissionChecker(userId, companyId, tool.requiredPageKey, tool.accessLevel);

          const inputSchema = zodToJsonSchema(tool.inputSchema);

          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema,
          });
        } catch {
          // Tool not accessible to this session — omit from list
        }
      }

      return { tools };
    },

    async handleCallTool(params: McpCallToolParams): Promise<McpToolResult> {
      const startMs = Date.now();
      const tool = registry.get(params.name) as AnyTool | undefined;

      if (!tool) {
        const result = errorResult(
          `Tool "${params.name}" not found.`,
          "NOT_FOUND"
        );
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: params.name,
          args: JSON.stringify(params.arguments ?? {}),
          status: "error",
          durationMs: Date.now() - startMs,
          errorDetail: result.error,
          source: "mcp",
        });
        return result;
      }

      const parseResult = tool.inputSchema.safeParse(params.arguments ?? {});
      if (!parseResult.success) {
        const detail = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        const result = errorResult(
          `Validation failed: ${detail}`,
          "VALIDATION_ERROR"
        );
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: tool.name,
          args: JSON.stringify(params.arguments ?? {}),
          status: "error",
          durationMs: Date.now() - startMs,
          errorDetail: result.error,
          source: "mcp",
        });
        return result;
      }

      const validatedInput = parseResult.data;

      let gateResult: McpWriteGateResult | void;
      try {
        gateResult = await callbacks.permissionChecker(
          userId, companyId, tool.requiredPageKey, tool.accessLevel
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isWriteDisabled = msg.includes("MCP writes are not enabled");
        const result = errorResult(
          msg,
          isWriteDisabled ? "WRITE_DISABLED" : "PERMISSION_DENIED"
        );
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: tool.name,
          args: JSON.stringify(validatedInput),
          status: isWriteDisabled ? "write-disabled" : "permission-denied",
          durationMs: Date.now() - startMs,
          errorDetail: msg,
          source: "mcp",
        });
        return result;
      }

      if (tool.accessLevel === "WRITE" && gateResult && (gateResult as McpWriteGateResult).needsApproval) {
        try {
          const { pendingApprovalId } = await callbacks.approvalRouter(
            userId, companyId, tool.requiredPageKey, tool.name, validatedInput
          );
          const result = approvalResult(pendingApprovalId);
          await safeAudit(callbacks, {
            userId, companyId,
            toolName: tool.name,
            args: JSON.stringify(validatedInput),
            status: "pending-approval",
            durationMs: Date.now() - startMs,
            resultDetail: String(pendingApprovalId),
            source: "mcp",
          });
          return result;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const result = errorResult(msg, "INTERNAL_ERROR");
          await safeAudit(callbacks, {
            userId, companyId,
            toolName: tool.name,
            args: JSON.stringify(validatedInput),
            status: "error",
            durationMs: Date.now() - startMs,
            errorDetail: msg,
            source: "mcp",
          });
          return result;
        }
      }

      let result: McpToolResult;
      try {
        if (params.signal?.aborted) {
          const reason = params.signal.reason instanceof Error
            ? params.signal.reason.message
            : String(params.signal.reason ?? "Cancelled");
          return errorResult(reason, "INVALID_STATE");
        }

        result = await tool.handler(
          { db: callbacks.db, userId, companyId, requestId: session.requestId, signal: params.signal },
          validatedInput
        );
        result = serializeDeep(result) as McpToolResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[mcp] Handler error in "${tool.name}": ${msg}\n${err instanceof Error && err.stack ? err.stack : ""}\n`
        );
        result = mapGatekeeperError(err, msg);
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: tool.name,
          args: JSON.stringify(validatedInput),
          status: "error",
          durationMs: Date.now() - startMs,
          errorDetail: msg,
          source: "mcp",
        });
        return result;
      }

      await safeAudit(callbacks, {
        userId, companyId,
        toolName: tool.name,
        args: JSON.stringify(validatedInput),
        status: "success",
        durationMs: Date.now() - startMs,
        source: "mcp",
      });

      return result;
    },
  };
}

/** Map gatekeeper errors to structured MCP error codes. */
export function mapGatekeeperError(err: unknown, msg: string): McpToolResult {
  if (err instanceof Error && err.name === "PermissionError") {
    return errorResult(msg, "PERMISSION_DENIED");
  }
  if (msg.includes("P2002") || msg.includes("Unique constraint")) {
    return errorResult("A record with these details already exists.", "CONFLICT");
  }
  if (msg.includes("P2025") || msg.includes("Record to update not found")) {
    return errorResult("The requested record was not found.", "NOT_FOUND");
  }
  if (
    msg.includes("not allowed from") ||
    msg.includes("status transition") ||
    msg.includes("state transition") ||
    (msg.includes("Cannot") && (msg.includes("status") || msg.includes("state"))) ||
    msg.includes("Invalid state")
  ) {
    return errorResult(msg, "INVALID_STATE");
  }
  if (
    msg.includes("must have subtype") ||
    msg.includes("Validation") ||
    msg.includes("balance") ||
    msg.includes("Insufficient")
  ) {
    return errorResult(msg, "VALIDATION_ERROR");
  }
  void err;
  return errorResult("An internal error occurred.", "INTERNAL_ERROR");
}

/** Fire-and-forget audit write — never throws. */
async function safeAudit(
  callbacks: McpServerCallbacks,
  entry: Parameters<McpServerCallbacks["auditWriter"]>[0]
): Promise<void> {
  try {
    await callbacks.auditWriter(entry);
  } catch {
    // Audit failure must never surface to the caller
  }
}

/**
 * Convert a Zod schema to JSON Schema for the MCP protocol.
 */
import { zodToJsonSchema as zodToJsonSchemaLib } from "zod-to-json-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToJsonSchema(schema: import("zod").ZodSchema): Record<string, unknown> {
  try {
    return zodToJsonSchemaLib(schema) as Record<string, unknown>;
  } catch {
    return { type: "object" };
  }
}