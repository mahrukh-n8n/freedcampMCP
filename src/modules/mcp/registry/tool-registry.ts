/**
 * MCP Module — ToolRegistry
 *
 * Singleton-register-freeze pattern.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 *
 * The registry stores tool definitions without inspecting their handler's
 * `db` type. App-side tools constrain `TDb` to their real client;
 * the registry accepts them via the non-generic `AnyTool` contract.
 */

import type { McpToolDefinition } from "../types";

/** Regex enforcing the {domain}.{action} naming convention. */
const TOOL_NAME_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = McpToolDefinition<any>;

export class ToolRegistry {
  private readonly _tools = new Map<string, AnyTool>();
  private _frozen = false;

  /**
   * Register a tool definition.
   * Throws if the registry is frozen, the name format is invalid, or the name is duplicate.
   */
  register(tool: AnyTool): void {
    if (this._frozen) {
      throw new Error(
        `ToolRegistry is frozen — cannot register "${tool.name}" after freeze().`
      );
    }

    if (!TOOL_NAME_RE.test(tool.name)) {
      throw new Error(
        `Invalid tool name "${tool.name}". Must match {domain}.{action} — e.g. "po.list", "account_create".`
      );
    }

    if (this._tools.has(tool.name)) {
      throw new Error(
        `Duplicate tool name "${tool.name}". Each tool name must be unique.`
      );
    }

    this._tools.set(tool.name, tool);
  }

  /**
   * Freeze the registry. No further registrations are accepted after this call.
   * Idempotent — safe to call multiple times.
   */
  freeze(): void {
    this._frozen = true;
  }

  /** Whether the registry has been frozen. */
  isFrozen(): boolean {
    return this._frozen;
  }

  /** Return all registered tools as a read-only array. */
  all(): ReadonlyArray<AnyTool> {
    return Array.from(this._tools.values());
  }

  /** Return a single tool by name, or undefined if not registered. */
  get(name: string): AnyTool | undefined {
    return this._tools.get(name);
  }

  /** Return all tools whose requiredPageKey is in the allowed set. */
  forPages(allowedPageKeys: ReadonlySet<string>): ReadonlyArray<AnyTool> {
    return Array.from(this._tools.values()).filter((t) =>
      allowedPageKeys.has(t.requiredPageKey)
    );
  }

  /** Return registered tool names (useful for tests). */
  listTools(): ReadonlyArray<AnyTool> {
    return Array.from(this._tools.values());
  }
}

/** Singleton instance — used by both the subprocess entry and registration files. */
export const toolRegistry = new ToolRegistry();

/** Factory for testing or isolated subprocess instances. */
export function createMcpToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}