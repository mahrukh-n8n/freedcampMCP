/**
 * MCP Module — stdio JSON-RPC Transport
 *
 * Reads newline-delimited JSON-RPC 2.0 messages from stdin,
 * dispatches to the MCP server, and writes responses to stdout.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 */

import type { McpServer } from "./create-mcp-server";
import { errorResult } from "../utils/serialize";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INTERNAL_ERROR = -32603;

/**
 * Start the stdio transport loop.
 * Reads from process.stdin, writes to process.stdout.
 * Runs until stdin closes (subprocess exit).
 */
export async function startStdioTransport(server: McpServer): Promise<void> {
  let buffer = "";

  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      void handleLine(trimmed, server);
    }
  });

  process.stdin.on("end", () => {
    const trimmed = buffer.trim();
    if (trimmed) {
      void handleLine(trimmed, server);
    }
    process.exit(0);
  });

  process.stdin.on("error", (err) => {
    process.stderr.write(`stdio transport error: ${err.message}\n`);
    process.exit(1);
  });

  await new Promise<void>(() => {
    // Resolved by process.exit() in the 'end' handler
  });
}

async function handleLine(line: string, server: McpServer): Promise<void> {
  let request: JsonRpcRequest;

  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    sendError(null, RPC_PARSE_ERROR, "Parse error");
    return;
  }

  if (!request.method || typeof request.method !== "string") {
    sendError(request.id ?? null, RPC_INVALID_REQUEST, "Invalid Request");
    return;
  }

  const id = request.id ?? null;

  try {
    switch (request.method) {
      case "initialize": {
        sendResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "freedcamp-mcp", version: "0.1.0" },
        });
        break;
      }

      case "tools/list": {
        const result = await server.handleListTools();
        sendResult(id, result);
        break;
      }

      case "tools/call": {
        const params = request.params ?? {};
        const toolName = params.name as string | undefined;
        const toolArgs = params.arguments as Record<string, unknown> | undefined;

        if (!toolName) {
          sendError(id, RPC_INVALID_REQUEST, "Missing tool name");
          return;
        }

        const result = await server.handleCallTool({
          name: toolName,
          arguments: toolArgs,
        });

        if (result.ok) {
          sendResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          });
        } else {
          sendResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: true,
          });
        }
        break;
      }

      case "notifications/initialized":
      case "notifications/cancelled": {
        break;
      }

      case "ping": {
        sendResult(id, {});
        break;
      }

      default: {
        sendError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${request.method}`);
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    process.stderr.write(`[mcp] unhandled error in ${request.method}: ${msg}\n`);
    sendError(id, RPC_INTERNAL_ERROR, "Internal error");
  }
}

function sendResult(id: string | number | null, result: unknown): void {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
    result,
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

function sendError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): void {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

void errorResult;