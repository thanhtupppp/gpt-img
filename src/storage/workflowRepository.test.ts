import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { PIECS_SCHEMA_VERSION, type PiecsWorkflow } from "../domain/types";
import { closeDatabaseForTests } from "./database";
import { deleteWorkflow, listWorkflows, saveWorkflow, WorkflowRepositoryError } from "./workflowRepository";

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

  it("deletes a workflow", async () => {
    await saveWorkflow(workflow);
    await deleteWorkflow(workflow.id);
    expect(await listWorkflows()).toEqual([]);
  });

  it("rejects invalid workflow data", async () => {
    await expect(saveWorkflow({ ...workflow, steps: [] })).rejects.toBeInstanceOf(WorkflowRepositoryError);
  });
});
