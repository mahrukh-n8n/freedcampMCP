---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - .env.example
  - scripts/mcp-server.ts
autonomous: true
transition_safety:
  safe: true
requirements:
  - AUTH-02
  - AUTH-06
  - API-04

must_haves:
  truths:
    - "Project scaffold is runnable via tsx without build step"
    - "Env vars load at boot without compile-time build"
    - "Subprocess entry point starts without TypeScript errors"
  artifacts:
    - path: "package.json"
      provides: "Dependencies, scripts, and type declarations for stdio subprocess"
      min_lines: 20
    - path: "tsconfig.json"
      provides: "TypeScript compiler configuration targeting Node ES2022"
      min_lines: 10
    - path: ".env.example"
      provides: "Documented env var template for FREEDCAMP_API_KEY and FREEDCAMP_API_SECRET"
    - path: "scripts/mcp-server.ts"
      provides: "Subprocess entry point that bootstraps and waits for stdio input"
      min_lines: 30
  key_links:
    - from: "scripts/mcp-server.ts"
      to: "dotenv"
      via: "import + config() call"
      pattern: "dotenv/config"
    - from: "package.json"
      to: "tsx"
      via: "devDependency + scripts entry"
      pattern: "tsx"
---

<objective>
Scaffold the TypeScript project with dependency installation, tsconfig setup, and the subprocess entry point. This establishes the foundation everything else builds on.

Purpose: Runnable project skeleton before any business logic is written.
Output: `package.json`, `tsconfig.json`, `.env.example`, `scripts/mcp-server.ts`
</objective>

<execution_context>
@~/.claude/get-shit-right/workflows/execute-plan.md
@~/.claude/get-shit-right/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/01-foundation/01-RESEARCH.md — standard stack versions, project structure, subprocess entry pattern
</context>

<tasks>

<task type="auto">
  <name>T1: Initialize TypeScript project with dependencies</name>
  <files>package.json, tsconfig.json</files>
  <action>
Create `package.json` with:
- name: "freedcamp-mcp"
- type: "module"
- version: "0.1.0"
- imports: "tsx" (run TypeScript scripts without build)
- dependencies: "zod" (^4.3.6), "dotenv" (^17.0.0)
- devDependencies: "typescript" (^5.7.0), "tsx" (^4.21.0), "@types/node" (^22.0.0)
- scripts: "dev": "tsx scripts/mcp-server.ts", "typecheck": "tsc --noEmit"
- type: "module" in package.json (NOT tsconfig "module": "NodeNext")

Create `tsconfig.json` with:
- target: "ES2022"
- module: "NodeNext"
- moduleResolution: "NodeNext"
- outDir: "./dist"
- rootDir: "./src"
- strict: true
- esModuleInterop: true
- skipLibCheck: true
</action>
  <verify>node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).type)"</verify>
  <done>package.json and tsconfig.json exist with correct module type: module</done>
</task>

<task type="auto">
  <name>T2: Create .env.example with documented env vars</name>
  <files>.env.example</files>
  <action>
Create `.env.example` with:
```
# Freedcamp API credentials (get from Freedcamp Settings → API)
FREEDCAMP_API_KEY=your_api_key_here
FREEDCAMP_API_SECRET=your_api_secret_here
```
Also create an empty `.env` file (git-ignored) so the dev script can run without erroring.
</action>
  <verify>test -f .env.example && test -f .env</verify>
  <done>.env.example documents both required env vars; .env file exists (empty)</done>
</task>

<task type="auto">
  <name>T3: Write subprocess entry point skeleton</name>
  <files>scripts/mcp-server.ts</files>
  <action>
Create `scripts/mcp-server.ts` — the stdio subprocess entry point:

```typescript
import "dotenv/config";
import { randomUUID } from "crypto";

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
```

The real stdio loop wiring comes in Plan 2 (after copying the portable module).
</action>
  <verify>tsx --eval "console.log('tsx works')"</verify>
  <done>scripts/mcp-server.ts parses dotenv and checks for required env vars without erroring</done>
</task>

</tasks>

<verification>
- `npm install` succeeds with no warnings
- `tsx scripts/mcp-server.ts` prints "[mcp] Boot complete, waiting for stdio input..."
- `npm run typecheck` passes with zero errors
</verification>

<success_criteria>
TypeScript project compiles cleanly, dependencies installed, subprocess boots and waits for stdio input without crashing.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-foundation-01-SUMMARY.md`
</output>