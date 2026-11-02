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

export async function deleteWorkflow(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("workflows", "readwrite");
  transaction.objectStore("workflows").delete(id);
  await transactionComplete(transaction);
}
