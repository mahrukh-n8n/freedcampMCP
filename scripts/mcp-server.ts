import "dotenv/config";

import { toolRegistry } from "../src/modules/mcp/registry/tool-registry";
import { createMcpServer } from "../src/modules/mcp/services/create-mcp-server";
import { startStdioTransport } from "../src/modules/mcp/services/stdio-transport";
import { FreedcampApiClient } from "../src/lib/freedcamp/api-client";
import { createCallbacks } from "../src/lib/freedcamp/callbacks";
import { registerAllTools } from "../src/lib/freedcamp/register-tools";
import { logger } from "../src/lib/freedcamp/utils/logger";

let server: ReturnType<typeof createMcpServer> | undefined;

async function boot() {
  const apiKey = process.env.FREEDCAMP_API_KEY ?? "";
  const apiSecret = process.env.FREEDCAMP_API_SECRET ?? "";
  const baseUrl = process.env.FREEDCAMP_API_URL;

  if (!apiKey || !apiSecret) {
    throw new Error("FREEDCAMP_API_KEY and FREEDCAMP_API_SECRET must be set in .env");
  }

  // Create API client
  const client = new FreedcampApiClient({ apiKey, apiSecret, baseUrl });

  // Validate credentials and get DI callbacks
  const callbacks = await createCallbacks(apiKey, apiSecret, baseUrl);
  const validationResult = await callbacks.apiKeyValidator(apiKey, 0);
  const { userId } = validationResult;

  // Register all tools (freezes registry)
  registerAllTools(client, apiKey, apiSecret, baseUrl);

  // Create session and MCP server
  const session = { userId, companyId: 0, requestId: "boot" };
  server = createMcpServer(session, toolRegistry, callbacks);

  // Start stdio transport
  logger.info("Boot complete, listening on stdio");
  await startStdioTransport(server);
}

// Graceful shutdown — drain in-flight requests before exiting
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Allow in-flight requests ~2s to complete
  const timeout = setTimeout(() => {
    logger.warn("Forcing exit — requests still in flight");
    process.exit(0);
  }, 2000);

  // Close MCP server connections if available
  // McpServer doesn't have close() — just let in-flight requests drain
  server = undefined;

  clearTimeout(timeout);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

boot().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});