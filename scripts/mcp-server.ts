import "dotenv/config";

async function boot() {
  const apiKey = process.env.FREEDCAMP_API_KEY ?? "";
  const apiSecret = process.env.FREEDCAMP_API_SECRET ?? "";

  if (!apiKey || !apiSecret) {
    throw new Error("FREEDCAMP_API_KEY and FREEDCAMP_API_SECRET must be set in .env");
  }

  // Placeholder: actual tool registration and stdio loop come in later plans
  console.error("[mcp] Boot complete, waiting for stdio input...");
}

boot().catch((err) => {
  process.stderr.write(`[mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});