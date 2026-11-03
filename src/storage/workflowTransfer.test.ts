import { describe, expect, it } from "vitest";
import { PIECS_SCHEMA_VERSION, type PiecsWorkflow } from "../domain/types";
import { exportWorkflows, parseWorkflowImport } from "./workflowTransfer";

const workflow: PiecsWorkflow = {
  id: "WORKFLOW-001",
  name: "Product cleanup",
  description: "Analyze and retouch a product photo.",
  steps: [{ id: "step-1", commandId: "analyze", parameters: { raw: "scope=full" } }],
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("workflow transfer", () => {
  it("exports and parses a workflow bundle", () => {
    expect(parseWorkflowImport(exportWorkflows([workflow]))).toEqual([workflow]);
  });

  it("rejects unknown package sources and unsupported schema versions", () => {
    const bundle = JSON.parse(exportWorkflows([workflow])) as Record<string, unknown>;
    expect(() => parseWorkflowImport(JSON.stringify({ ...bundle, system: "OTHER" }))).toThrow("PIECS");
    expect(() => parseWorkflowImport(JSON.stringify({ ...bundle, schemaVersion: "9.9.9" }))).toThrow("schema");
    expect(() => parseWorkflowImport(JSON.stringify({ workflows: [workflow] }))).toThrow("PIECS");
  });

  it("rejects malformed JSON, invalid records, and duplicate IDs", () => {
    expect(() => parseWorkflowImport("{")).toThrow("JSON");
    expect(() => parseWorkflowImport(JSON.stringify({ system: "PIECS", schemaVersion: PIECS_SCHEMA_VERSION, workflows: [{ ...workflow, steps: [] }] }))).toThrow("không hợp lệ");
    expect(() => parseWorkflowImport(JSON.stringify({ system: "PIECS", schemaVersion: PIECS_SCHEMA_VERSION, workflows: [workflow, workflow] }))).toThrow("trùng");
  });
});
