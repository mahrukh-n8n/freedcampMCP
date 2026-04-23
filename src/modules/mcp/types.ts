/**
 * MCP Module — Core Types
 *
 * Portable contract types for the MCP server module.
 * No runtime imports from app business logic, Next.js, or Node built-ins.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 *
 * Database type: the portable module never knows which database client the
 * host app uses. A generic `TDb` parameter lets app-side code constrain it
 * to PrismaClient (or any other client) without the module importing it.
 */

import type { ZodSchema } from "zod";

// ── Session Context ──────────────────────────────────────────────────────────

/**
 * Fixed session context resolved once at subprocess startup.
 * Held for the lifetime of the stdio process — not per-request.
 */
export type McpSessionContext = {
  userId: number;
  companyId: number;
  requestId: string;
};

// ── Tool Access ──────────────────────────────────────────────────────────────

/** Access level required to invoke a tool. */
export type McpAccessLevel = "READ" | "WRITE";

// ── Staged Response Envelope ─────────────────────────────────────────────────

/**
 * Hybrid result kinds covering all phases of a staged dependent workflow.
 *
 * - data       : plain read result (list, get)
 * - selection  : context/choices for the user to select from (get_create_context)
 * - resolution : derived state after an upstream choice (resolve_*)
 * - preview    : pre-commit consequence preview with derived totals and warnings (preview_*)
 * - commit     : result of a final write — immediate or approval-pending
 * - warning    : non-blocking advisory that requires acknowledgment before continuing
 * - blocked    : hard blocker — no commit path until resolved
 */
export type McpToolResultKind =
  | "data"
  | "selection"
  | "resolution"
  | "preview"
  | "commit"
  | "warning"
  | "blocked";

/** A missing-input requirement the caller must resolve before proceeding. */
export type McpRequirement = {
  field: string;
  label: string;
  description?: string;
};

/** A choice the caller may select from to resolve a workflow dependency. */
export type McpChoice = {
  id: string | number;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

/** A structured warning advisory. Not a hard blocker — caller may continue. */
export type McpWarning = {
  code: string;
  message: string;
  severity?: "low" | "medium" | "high";
};

/** A hard blocker. Commit cannot proceed until resolved. */
export type McpBlocker = {
  code: string;
  message: string;
};

/** A suggestion for the next tool call in a staged workflow. */
export type McpNextAction = {
  tool: string;
  description?: string;
  args?: Record<string, unknown>;
};

/**
 * Standard hybrid MCP tool result envelope.
 *
 * Top-level fields are always present; kind determines which payload fields are populated.
 */
export type McpToolResult = {
  ok: boolean;
  kind: McpToolResultKind;

  /** Primary payload — present on data/selection/resolution/preview results. */
  payload?: unknown;

  /** Derived values auto-computed from upstream choices. */
  derived?: Record<string, unknown>;

  /** Dynamic choices available at this workflow step. */
  choices?: Record<string, McpChoice[]>;

  /** Missing required inputs that must be resolved before continuing. */
  requirements?: McpRequirement[];

  /** Non-blocking warnings. */
  warnings?: McpWarning[];

  /** Hard blockers preventing commit. */
  blockers?: McpBlocker[];

  /** Suggested next tool calls. */
  next?: McpNextAction[];

  /** Error message — present when ok=false. */
  error?: string;

  /** Structured error code — present when ok=false. */
  errorCode?: McpErrorCode;
};

// ── Error Codes ──────────────────────────────────────────────────────────────

/** Structured error codes returned from MCP tool dispatch. */
export type McpErrorCode =
  | "PERMISSION_DENIED"
  | "WRITE_DISABLED"
  | "VALIDATION_ERROR"
  | "INVALID_STATE"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

// ── Tool Definition (visible public contract) ────────────────────────────────

/**
 * Tool context injected into every handler invocation.
 *
 * `TDb` defaults to `unknown` so the portable module stays database-agnostic.
 * App-side tools constrain it to their real client (e.g. `McpToolContext<PrismaClient>`).
 */
export type McpToolContext<TDb = unknown> = {
  db: TDb;
  userId: number;
  companyId: number;
  requestId: string;
  signal?: AbortSignal;
};

/**
 * MCP tool definition — the visible public contract.
 *
 * `TDb` flows through to the handler context. Defaults to `unknown` so the
 * portable module stays database-agnostic; app-side tool registrations
 * constrain it (e.g. `McpToolDefinition<PrismaClient>`).
 *
 * Approval and audit behavior are framework-driven and NOT part of this definition.
 * Handlers do not need to branch on needsApproval or call auditWriter.
 */
export type McpToolDefinition<TDb = unknown> = {
  /** Tool name. Must match `{domain}.{action}` pattern — e.g. "po.create", "account.list". */
  name: string;

  /** User-facing description shown in tools/list. */
  description: string;

  /**
   * Input schema — MUST be the exact same Zod schema used by the corresponding server action.
   * Never define a second schema for the same operation.
   */
  inputSchema: ZodSchema;

  /**
   * Page registry key used to look up the user's permission level.
   * Must match the pageKey from the web app's page registry.
   */
  requiredPageKey: string;

  /** READ tools call requirePageAccess; WRITE tools call requireWriteGate. */
  accessLevel: McpAccessLevel;

  /**
   * Tool handler — called only when permission checks pass.
   * Receives already-validated (Zod-parsed) input.
   */
  handler: (ctx: McpToolContext<TDb>, input: unknown) => Promise<McpToolResult>;
};

// ── Dependency Injection Callbacks (app-side implementations) ────────────────

/**
 * Result of a successful API key validation.
 * Returned once at subprocess startup; held for session lifetime.
 */
export type McpValidatedSession = {
  userId: number;
  companyId: number;
};

/**
 * Callback: validate API key + company context at subprocess startup.
 * Must fail fast with a clear error if invalid.
 */
export type McpApiKeyValidator = (
  rawKey: string,
  companyId: number
) => Promise<McpValidatedSession>;

/**
 * Callback: check and enforce page-level permissions.
 * For READ: calls requirePageAccess. For WRITE: calls requireWriteGate.
 * Returns writeGate for WRITE calls (includes needsApproval).
 */
export type McpPermissionChecker = (
  userId: number,
  companyId: number,
  pageKey: string,
  level: McpAccessLevel
) => Promise<McpWriteGateResult | void>;

/**
 * Result of a WRITE permission check.
 * When needsApproval is true, caller must route to approvalRouter instead of handler.
 */
export type McpWriteGateResult = {
  needsApproval: boolean;
};

/**
 * Callback: route a WRITE to the approval system when needsApproval=true.
 * Creates a PendingApproval row. No real entity is created.
 */
export type McpApprovalRouter = (
  userId: number,
  companyId: number,
  requiredPageKey: string,
  toolName: string,
  validatedInput: unknown
) => Promise<{ pendingApprovalId: number }>;

/** Structured audit entry written by the framework for every tool invocation. */
export type McpAuditEntry = {
  userId: number;
  companyId: number;
  toolName: string;
  args: string;
  status: "success" | "error" | "pending-approval" | "permission-denied" | "write-disabled";
  durationMs: number;
  errorDetail?: string;
  resultDetail?: string;
  source: "mcp";
};

/**
 * Callback: write a tool invocation audit entry.
 * Called by the framework dispatch loop — NOT by individual handlers.
 */
export type McpAuditWriter = (entry: McpAuditEntry) => Promise<void>;

/**
 * All app-side dependency-injection callbacks bundled for createMcpServer.
 *
 * `TDb` defaults to `unknown` — the portable module never inspects it.
 * App-side boot code constrains it (e.g. `McpServerCallbacks<PrismaClient>`).
 */
export type McpServerCallbacks<TDb = unknown> = {
  db: TDb;
  apiKeyValidator: McpApiKeyValidator;
  permissionChecker: McpPermissionChecker;
  approvalRouter: McpApprovalRouter;
  auditWriter: McpAuditWriter;
};