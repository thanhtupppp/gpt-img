import { describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "../domain/types";
import type { WorkflowGraph } from "./workflowGraph";
import { demoGraphAdapter } from "./graphAdapters";
import { executeWorkflowGraph, type GraphExecutionAdapter, type GraphExecutionSnapshot } from "./graphRuntime";

const node = (id: string): WorkflowStep => ({ id, commandId: id, parameters: {} });
const graph = (ids: string[], edges: Array<[string, string]>): WorkflowGraph => ({
  schemaVersion: "1.0.0",
  nodes: ids.map(node),
  edges: edges.map(([from, to], index) => ({ id: `edge-${index}`, from, to })),
});

describe("hybrid workflow graph runtime", () => {
  it("executes sequential nodes, parallel branches, and joins in dependency order", async () => {
    const input = graph(
      ["source", "branch-a", "branch-b", "join"],
      [["source", "branch-a"], ["source", "branch-b"], ["branch-a", "join"], ["branch-b", "join"]],
    );
    const completed: string[] = [];
    const adapter: GraphExecutionAdapter = {
      id: "test",
      name: "Test adapter",
      async executeStep(step, context) {
        if (step.id === "join") expect(Object.keys(context.inputs).sort()).toEqual(["branch-a", "branch-b"]);
        await Promise.resolve();
        completed.push(step.id);
        return { message: step.id, metadata: { node: step.id } };
      },
    };
    const result = await executeWorkflowGraph(input, adapter, {
      save: async () => undefined,
      isCancelRequested: async () => false,
    });
    expect(result.status).toBe("succeeded");
    expect(result.progress).toBe(100);
    expect(completed.indexOf("source")).toBeLessThan(completed.indexOf("branch-a"));
    expect(completed.indexOf("source")).toBeLessThan(completed.indexOf("branch-b"));
    expect(completed.indexOf("branch-a")).toBeLessThan(completed.indexOf("join"));
    expect(completed.indexOf("branch-b")).toBeLessThan(completed.indexOf("join"));
  });

  it("runs branches concurrently while respecting maxConcurrency", async () => {
    const input = graph(["root", "a", "b", "c", "d"], [["root", "a"], ["root", "b"], ["root", "c"], ["root", "d"]]);
    let active = 0;
    let peak = 0;
    const adapter: GraphExecutionAdapter = {
      id: "parallel",
      name: "Parallel adapter",
      async executeStep(step) {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return { message: step.id };
      },
    };
    const result = await executeWorkflowGraph(input, adapter, {
      save: async () => undefined,
      isCancelRequested: async () => false,
    }, { maxConcurrency: 2 });
    expect(result.status).toBe("succeeded");
    expect(peak).toBe(2);
  });

  it("does not start dependent waves after a node fails", async () => {
    const input = graph(["root", "branch", "join"], [["root", "branch"], ["branch", "join"]]);
    const calls: string[] = [];
    const adapter: GraphExecutionAdapter = {
      id: "failing",
      name: "Failing adapter",
      async executeStep(step) {
        calls.push(step.id);
        if (step.id === "branch") throw new Error("provider failed");
        return { message: step.id };
      },
    };
    const result = await executeWorkflowGraph(input, adapter, {
      save: async () => undefined,
      isCancelRequested: async () => false,
    });
    expect(result.status).toBe("failed");
    expect(calls).toEqual(["root", "branch"]);
    expect(result.nodes.find((item) => item.nodeId === "join")?.status).toBe("blocked");
  });

  it("cancels before starting work when cancellation is requested", async () => {
    const adapter = { ...demoGraphAdapter, executeStep: vi.fn(demoGraphAdapter.executeStep) };
    const result = await executeWorkflowGraph(graph(["a"], []), adapter, {
      save: async () => undefined,
      isCancelRequested: async () => true,
    }, { graphId: "cancel-me" });
    expect(result.status).toBe("cancelled");
    expect(adapter.executeStep).not.toHaveBeenCalled();
  });

  it("keeps image bytes out of persisted execution snapshots", async () => {
    const persisted: GraphExecutionSnapshot[] = [];
    const adapter: GraphExecutionAdapter = {
      id: "image",
      name: "Image adapter",
      async executeStep() {
        return { message: "created image", image: { data: "private-image-bytes", mimeType: "image/png" } };
      },
    };
    const result = await executeWorkflowGraph(graph(["image"], []), adapter, {
      save: async (snapshot) => { persisted.push(snapshot); },
      isCancelRequested: async () => false,
    });
    expect(result.status).toBe("succeeded");
    expect(JSON.stringify(persisted)).not.toContain("private-image-bytes");
  });

  it("rejects invalid concurrency values", async () => {
    await expect(executeWorkflowGraph(graph(["a"], []), demoGraphAdapter, {
      save: async () => undefined,
      isCancelRequested: async () => false,
    }, { maxConcurrency: 0 })).rejects.toMatchObject({ code: "INVALID_CONCURRENCY" });
  });
});
