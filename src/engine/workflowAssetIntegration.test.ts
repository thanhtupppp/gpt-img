import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiGraphAdapter } from "./graphAdapters";
import { executeWorkflowGraph, type GraphExecutionSnapshot } from "./graphRuntime";
import type { WorkflowGraph } from "./workflowGraph";
import { createAsset, getAsset, listAssets } from "../storage/assetRepository";
import { closeDatabaseForTests } from "../storage/database";
import type { WorkflowStep } from "../domain/types";

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

const step = (id: string, parameters: WorkflowStep["parameters"] = {}): WorkflowStep => ({
  id,
  commandId: "image.generate",
  parameters,
});
const graph = (nodes: WorkflowStep[]): WorkflowGraph => ({
  schemaVersion: "1.0.0",
  nodes,
  edges: [],
});

describe("workflow asset integration", () => {
  it("persists generated image bytes separately and records only the asset reference in history", async () => {
    const persisted: GraphExecutionSnapshot[] = [];
    const result = await executeWorkflowGraph(graph([step("render")]), {
      id: "image-test",
      name: "Image test adapter",
      async executeStep() {
        return { message: "Rendered", image: { data: "AQID", mimeType: "image/png" } };
      },
    }, {
      save: async (snapshot) => { persisted.push(snapshot); },
      isCancelRequested: async () => false,
    }, { graphId: "graph-assets-1" });

    expect(result.status).toBe("succeeded");
    const node = result.nodes[0];
    expect(node.assetId).toBeTruthy();
    const stored = await getAsset(node.assetId!);
    expect(stored?.graphId).toBe("graph-assets-1");
    expect(stored?.nodeId).toBe("render");
    expect([...new Uint8Array(await stored!.blob.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(persisted[persisted.length - 1]?.nodes[0].assetId).toBe(node.assetId);
    expect(JSON.stringify(persisted)).not.toContain("AQID");
    expect((await listAssets()).length).toBe(1);
  });

  it("loads an explicitly selected saved asset as Gemini input", async () => {
    const saved = await createAsset({
      name: "Input photo",
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      source: "upload",
    });
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        model: "test-model",
        image: { data: "BAUG", mime_type: "image/png" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const adapter = createGeminiGraphAdapter();
    const result = await adapter.executeStep(step("edit", { input_asset_id: saved.id }), {
      graphId: "graph-2",
      nodeId: "edit",
      attempt: 1,
      inputs: {},
    }, new AbortController().signal);

    expect(requestBody?.image_base64).toBe("AQID");
    expect(requestBody?.mime_type).toBe("image/png");
    expect(result.image?.data).toBe("BAUG");
  });

  it("fails clearly when an explicitly selected asset no longer exists", async () => {
    const adapter = createGeminiGraphAdapter();
    await expect(adapter.executeStep(step("edit", { input_asset_id: "missing-asset" }), {
      graphId: "graph-3",
      nodeId: "edit",
      attempt: 1,
      inputs: {},
    }, new AbortController().signal)).rejects.toThrow("was not found in Asset Library");
  });
});
