/**
 * mcp module — public API (SERVER-ONLY)
 *
 * Import everything from "@/modules/mcp" — never reach into subdirectories.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 *
 * Only generic dependencies are allowed (zod, standard library).
 */

// ── Types (core portable contract) ──────────────────────────
export * from "./types";

// ── Models ────────────────────────────────────────────────────
export * from "./models/response-types";

// ── Registry ────────────────────────────────────────────────
export * from "./registry/tool-registry";

// ── Services ────────────────────────────────────────────────
export * from "./services/create-mcp-server";
export * from "./services/stdio-transport";

// ── Utils ───────────────────────────────────────────────────
export * from "./utils/serialize";