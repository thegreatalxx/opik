import { z } from "zod";
import { trackStorage } from "@/decorators/track";
import { createTypedAgentConfig } from "@/agent-config/TypedAgentConfig";
import { extractFieldMetadata } from "@/agent-config/typeHelpers";

const schema = z
  .object({
    temperature: z.number().describe("Sampling temperature"),
    model: z.string(),
  })
  .describe("Cfg");

const fieldMeta = extractFieldMetadata(schema, "Cfg");

function makeConfig(overrides?: Partial<Parameters<typeof createTypedAgentConfig>[0]>) {
  return createTypedAgentConfig({
    schema,
    values: { temperature: 0.5, model: "gpt-4" },
    fieldMeta,
    blueprintId: "bp-123",
    blueprintVersion: "v2",
    envs: ["prod"],
    isFallback: false,
    deployTo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

describe("TypedAgentConfig", () => {
  it("exposes typed values", () => {
    const cfg = makeConfig();
    expect(cfg.temperature).toBe(0.5);
    expect(cfg.model).toBe("gpt-4");
  });

  it("exposes meta properties", () => {
    const cfg = makeConfig();
    expect(cfg.blueprintId).toBe("bp-123");
    expect(cfg.blueprintVersion).toBe("v2");
    expect(cfg.envs).toEqual(["prod"]);
    expect(cfg.isFallback).toBe(false);
  });

  it("delegates deployTo", async () => {
    const deployTo = vi.fn().mockResolvedValue(undefined);
    const cfg = makeConfig({ deployTo });
    await cfg.deployTo("staging");
    expect(deployTo).toHaveBeenCalledWith("staging");
  });

  it("injects trace metadata on field access inside track()", () => {
    const updateSpy = vi.fn();
    const mockCtx = {
      span: { update: updateSpy },
      trace: { update: updateSpy },
    };

    trackStorage.run(mockCtx as unknown as Parameters<typeof trackStorage.run>[0], () => {
      const cfg = makeConfig();
      void cfg.temperature;
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          agent_configuration: expect.objectContaining({
            _blueprint_id: "bp-123",
            blueprint_version: "v2",
          }),
        }),
      })
    );
  });

  it("does not inject metadata outside track()", () => {
    const updateSpy = vi.fn();
    const cfg = makeConfig();
    void cfg.temperature;
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("isFallback is true when configured so", () => {
    const cfg = makeConfig({ isFallback: true, blueprintId: undefined, blueprintVersion: undefined });
    expect(cfg.isFallback).toBe(true);
  });
});
