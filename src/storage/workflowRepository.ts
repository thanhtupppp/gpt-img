import { isPiecsWorkflow } from "../domain/validation";
import type { PiecsWorkflow } from "../domain/types";
import { openDatabase, requestResult, transactionComplete } from "./database";

export class WorkflowRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowRepositoryError";
  }
}

export async function listWorkflows(): Promise<PiecsWorkflow[]> {
  const database = await openDatabase();
  const transaction = database.transaction("workflows", "readonly");
  const result = await requestResult(transaction.objectStore("workflows").getAll()) as PiecsWorkflow[];
  await transactionComplete(transaction);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveWorkflow(value: unknown): Promise<PiecsWorkflow> {
  if (!isPiecsWorkflow(value)) {
    throw new WorkflowRepositoryError("Workflow data is invalid or uses an unsupported schema version.");
  }
  const database = await openDatabase();
  const transaction = database.transaction("workflows", "readwrite");
  transaction.objectStore("workflows").put(value);
  await transactionComplete(transaction);
  return value;
}

export async function cloneWorkflow(id: string, newId: string): Promise<PiecsWorkflow> {
  const source = await getWorkflow(id);
  if (!source) throw new WorkflowRepositoryError("Workflow not found.");
  if (await getWorkflow(newId)) throw new WorkflowRepositoryError("A workflow with this ID already exists.");

  const now = new Date().toISOString();
  const clone: PiecsWorkflow = {
    ...source,
    id: newId,
    name: `${source.name} (Copy)`,
    steps: source.steps.map((step, index) => ({
      ...step,
      id: `${newId}-step-${index + 1}`,
      parameters: { ...step.parameters },
    })),
    createdAt: now,
    updatedAt: now,
  };
  return saveWorkflow(clone);
}

export async function getWorkflow(id: string): Promise<PiecsWorkflow | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction("workflows", "readonly");
  const result = await requestResult(transaction.objectStore("workflows").get(id)) as PiecsWorkflow | undefined;
  await transactionComplete(transaction);
  return result;
}

export async function importWorkflows(values: unknown[]): Promise<PiecsWorkflow[]> {
  if (!Array.isArray(values) || values.some((value) => !isPiecsWorkflow(value))) {
    throw new WorkflowRepositoryError("Import contains an invalid workflow.");
  }
  const workflows = values as PiecsWorkflow[];
  const incomingIds = new Set<string>();
  for (const workflow of workflows) {
    if (incomingIds.has(workflow.id)) {
      throw new WorkflowRepositoryError(`Duplicate workflow ID in import: ${workflow.id}`);
    }
    incomingIds.add(workflow.id);
  }

  const database = await openDatabase();
  const transaction = database.transaction("workflows", "readwrite");
  const completed = transactionComplete(transaction);
  const store = transaction.objectStore("workflows");
  try {
    const existing = await requestResult(store.getAll()) as PiecsWorkflow[];
    const existingIds = new Set(existing.map((item) => item.id));
    const collision = workflows.find((item) => existingIds.has(item.id));
    if (collision) {
      transaction.abort();
      await completed.catch(() => undefined);
      throw new WorkflowRepositoryError(`Workflow ID ${collision.id} already exists; nothing was imported.`);
    }
    for (const workflow of workflows) store.add(workflow);
    await completed;
    return workflows;
  } catch (error) {
    await completed.catch(() => undefined);
    if (error instanceof WorkflowRepositoryError) throw error;
    throw new WorkflowRepositoryError(error instanceof Error ? error.message : "Unable to import workflows.");
  }
}

export async function deleteWorkflow(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("workflows", "readwrite");
  transaction.objectStore("workflows").delete(id);
  await transactionComplete(transaction);
}
