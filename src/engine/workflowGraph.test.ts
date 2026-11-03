import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "../domain/types";
import { buildWorkflowExecutionPlan, validateWorkflowGraph, type WorkflowGraph } from "./workflowGraph";

const node = (id: string): WorkflowStep => ({ id, commandId: id, parameters: {} });
const graph = (nodes: string[], edges: Array<[string, string]>): WorkflowGraph => ({
  schemaVersion: "1.0.0",
  nodes: nodes.map(node),
  edges: edges.map(([from, to], index) => ({ id: `edge-${index + 1}`, from, to })),
});

describe("hybrid workflow graph contract", () => {
  it("plans independent branches in the same wave and joins after both finish", () => {
    const input = graph(["source", "remove-bg", "color-grade", "compose"], [
      ["source", "remove-bg"],
      ["source", "color-grade"],
      ["remove-bg", "compose"],
      ["color-grade", "compose"],
    ]);
    const plan = buildWorkflowExecutionPlan(input);
    expect(plan.waves.map((wave) => wave.map((step) => step.id))).toEqual([
      ["source"],
      ["remove-bg", "color-grade"],
      ["compose"],
    ]);
  });

  it("preserves deterministic node order for parallel branches", () => {
    const plan = buildWorkflowExecutionPlan(graph(["source", "branch-b", "branch-a"], [["source", "branch-b"], ["source", "branch-a"]]));
    expect(plan.waves[1].map((step) => step.id)).toEqual(["branch-b", "branch-a"]);
  });

  it("accepts a fully sequential workflow", () => {
    expect(validateWorkflowGraph(graph(["a", "b", "c"], [["a", "b"], ["b", "c"]]))).toEqual([]);
  });

  it("rejects duplicate nodes and duplicate edges", () => {
    const input = graph(["a", "a", "b"], [["a", "b"], ["a", "b"]]);
    const codes = validateWorkflowGraph(input).map((issue) => issue.code);
    expect(codes).toContain("DUPLICATE_NODE");
    expect(codes).toContain("DUPLICATE_EDGE");
  });

  it("rejects missing nodes and self references", () => {
    const issues = validateWorkflowGraph(graph(["a"], [["a", "missing"], ["a", "a"]]));
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["MISSING_NODE", "SELF_REFERENCE"]));
  });

  it("rejects dependency cycles", () => {
    const issues = validateWorkflowGraph(graph(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]));
    expect(issues.map((issue) => issue.code)).toContain("CYCLE");
  });

  it("rejects an empty graph", () => {
    expect(validateWorkflowGraph(graph([], [])).map((issue) => issue.code)).toContain("EMPTY_GRAPH");
  });
});
