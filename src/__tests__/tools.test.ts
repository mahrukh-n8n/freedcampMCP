import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../modules/mcp/registry/tool-registry";
import { z } from "zod";

describe("Tool registry", () => {
  it("registers a valid tool and retrieves it", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test.ping",
      description: "Ping test",
      inputSchema: z.object({}),
      requiredPageKey: "test",
      accessLevel: "READ",
      handler: async () => ({ ok: true, kind: "data" as const, payload: {} }),
    });

    const tool = registry.get("test.ping");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("test.ping");
  });

  it("rejects invalid tool names not matching {domain}.{action}", () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register({
        name: "invalidName",
        description: "Bad name",
        inputSchema: z.object({}),
        requiredPageKey: "test",
        accessLevel: "READ",
        handler: async () => ({ ok: true, kind: "data" as const, payload: {} }),
      })
    ).toThrow(/Invalid tool name/);
  });

  it("rejects duplicate tool names", () => {
    const registry = new ToolRegistry();
    const tool = {
      name: "test.ping",
      description: "Ping",
      inputSchema: z.object({}),
      requiredPageKey: "test",
      accessLevel: "READ",
      handler: async () => ({ ok: true, kind: "data" as const, payload: {} }),
    };

    registry.register(tool);
    expect(() => registry.register(tool)).toThrow(/Duplicate tool name/);
  });

  it("freezes the registry preventing further registrations", () => {
    const registry = new ToolRegistry();
    registry.freeze();

    expect(() =>
      registry.register({
        name: "test.post_freeze",
        description: "Should fail",
        inputSchema: z.object({}),
        requiredPageKey: "test",
        accessLevel: "READ",
        handler: async () => ({ ok: true, kind: "data" as const, payload: {} }),
      })
    ).toThrow(/frozen/);
  });

  it("returns all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test.one",
      description: "One",
      inputSchema: z.object({}),
      requiredPageKey: "test",
      accessLevel: "READ",
      handler: async () => ({ ok: true, kind: "data" as const, payload: {} }),
    });
    registry.register({
      name: "test.two",
      description: "Two",
      inputSchema: z.object({}),
      requiredPageKey: "test",
      accessLevel: "WRITE",
      handler: async () => ({ ok: true, kind: "data" as const, payload: {} }),
    });

    const all = registry.all();
    expect(all).toHaveLength(2);
  });
});

describe("Zod schema validation for tools", () => {
  it("validates project list input schema", async () => {
    const { listProjectsSchema } = await import("../lib/freedcamp/tools/projects");
    const result = listProjectsSchema.safeParse({ limit: 10, offset: 0 });
    expect(result.success).toBe(true);
  });

  it("validates user list input schema", async () => {
    const { listUsersSchema } = await import("../lib/freedcamp/tools/users");
    const result = listUsersSchema.safeParse({ project_id: 5 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid limit values", async () => {
    const { listProjectsSchema } = await import("../lib/freedcamp/tools/projects");
    const result = listProjectsSchema.safeParse({ limit: -1 });
    expect(result.success).toBe(false);
  });
});