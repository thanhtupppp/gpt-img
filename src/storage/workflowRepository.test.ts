import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { PIECS_SCHEMA_VERSION, type PiecsWorkflow } from "../domain/types";
import { closeDatabaseForTests } from "./database";
import { cloneWorkflow, deleteWorkflow, importWorkflows, listWorkflows, saveWorkflow, WorkflowRepositoryError } from "./workflowRepository";

const workflow: PiecsWorkflow = {
  id: "WORKFLOW-001",
  name: "Product cleanup",
  description: "Analyze and retouch a product photo.",
  steps: [
    { id: "step-1", commandId: "analyze", parameters: {} },
    { id: "step-2", commandId: "retouch", parameters: { strength: "low" } },
  ],
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(async () => {
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

describe("workflow repository", () => {
  it("saves and lists workflows", async () => {
    await saveWorkflow(workflow);
    expect(await listWorkflows()).toEqual([workflow]);
  });

  it("updates an existing workflow by ID", async () => {
    await saveWorkflow(workflow);
    await saveWorkflow({ ...workflow, name: "Updated product cleanup" });
    expect((await listWorkflows())[0].name).toBe("Updated product cleanup");
    expect(await listWorkflows()).toHaveLength(1);
  });

  it("clones a workflow with independent step IDs and parameters", async () => {
    await saveWorkflow(workflow);
    const clone = await cloneWorkflow(workflow.id, "WORKFLOW-002");
    expect(clone.id).toBe("WORKFLOW-002");
    expect(clone.name).toBe("Product cleanup (Copy)");
    expect(clone.steps.map((step) => step.id)).toEqual(["WORKFLOW-002-step-1", "WORKFLOW-002-step-2"]);
    expect(clone.steps[1].parameters).toEqual({ strength: "low" });
    expect(await listWorkflows()).toHaveLength(2);
  });

  it("rejects cloning when the source is missing or the destination ID exists", async () => {
    await saveWorkflow(workflow);
    await expect(cloneWorkflow("missing", "WORKFLOW-002")).rejects.toBeInstanceOf(WorkflowRepositoryError);
    await expect(cloneWorkflow(workflow.id, workflow.id)).rejects.toBeInstanceOf(WorkflowRepositoryError);
  });

  it("imports a workflow batch atomically and rejects ID collisions", async () => {
    const second = { ...workflow, id: "WORKFLOW-002", name: "Second workflow" };
    await expect(importWorkflows([workflow, second])).resolves.toHaveLength(2);
    expect(await listWorkflows()).toHaveLength(2);
    await expect(importWorkflows([{ ...second, id: "WORKFLOW-003" }, second])).rejects.toBeInstanceOf(WorkflowRepositoryError);
    await expect(importWorkflows([workflow])).rejects.toBeInstanceOf(WorkflowRepositoryError);
    expect(await listWorkflows()).toHaveLength(2);
  });

  it("rejects duplicate IDs within one import batch without partial writes", async () => {
    const duplicate = { ...workflow, id: "WORKFLOW-DUPLICATE" };
    await expect(importWorkflows([duplicate, duplicate])).rejects.toThrow("Duplicate workflow ID");
    expect(await listWorkflows()).toEqual([]);
  });

  it("treats an empty workflow import as a safe no-op", async () => {
    await expect(importWorkflows([])).resolves.toEqual([]);
    expect(await listWorkflows()).toEqual([]);
  });

  it("deletes a workflow", async () => {
    await saveWorkflow(workflow);
    await deleteWorkflow(workflow.id);
    expect(await listWorkflows()).toEqual([]);
  });

  it("rejects invalid workflow data", async () => {
    await expect(saveWorkflow({ ...workflow, steps: [] })).rejects.toBeInstanceOf(WorkflowRepositoryError);
  });
});
