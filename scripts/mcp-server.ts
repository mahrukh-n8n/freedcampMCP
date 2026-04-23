import "dotenv/config";

import { toolRegistry } from "../src/modules/mcp/registry/tool-registry";
import { createMcpServer } from "../src/modules/mcp/services/create-mcp-server";
import { startStdioTransport } from "../src/modules/mcp/services/stdio-transport";
import { FreedcampApiClient } from "../src/lib/freedcamp/api-client";
import { createCallbacks } from "../src/lib/freedcamp/callbacks";
import { registerAllTools } from "../src/lib/freedcamp/register-tools";

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
  const server = createMcpServer(session, toolRegistry, callbacks);

  // Start stdio transport
  process.stderr.write("[mcp] Boot complete, listening on stdio...\n");
  await startStdioTransport(server);
}

boot().catch((err) => {
  process.stderr.write(`[mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});