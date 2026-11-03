import type { WorkflowGraph } from "../engine/workflowGraph";
import { buildWorkflowExecutionPlan, validateWorkflowGraph } from "../engine/workflowGraph";
import { openDatabase, requestResult, transactionComplete } from "./database";

export interface StoredWorkflowGraph {
  id: string;
  name: string;
  description: string;
  graph: WorkflowGraph;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkflowGraphRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowGraphRepositoryError";
  }
}

export function validateStoredWorkflowGraph(value: unknown): value is StoredWorkflowGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" || !item.id.trim() ||
    typeof item.name !== "string" || !item.name.trim() ||
    typeof item.description !== "string" ||
    typeof item.version !== "string" || !item.version.trim() ||
    typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) ||
    typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))
  ) return false;

  const graph = item.graph as WorkflowGraph | undefined;
  if (!graph || graph.schemaVersion !== "1.0.0" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;

  const invalidNode = graph.nodes.some((node) => {
    if (
      !node ||
      typeof node.id !== "string" || !node.id.trim() ||
      typeof node.commandId !== "string" || !node.commandId.trim() ||
      !node.parameters || typeof node.parameters !== "object" || Array.isArray(node.parameters)
    ) return true;

    return Object.values(node.parameters).some((parameter) =>
      !(typeof parameter === "string" ||
        typeof parameter === "boolean" ||
        (typeof parameter === "number" && Number.isFinite(parameter)))
    );
  });
  if (invalidNode) return false;

  const invalidEdge = graph.edges.some((edge) =>
    !edge ||
    typeof edge.id !== "string" || !edge.id.trim() ||
    typeof edge.from !== "string" ||
    typeof edge.to !== "string"
  );
  if (invalidEdge) return false;

  if (validateWorkflowGraph(graph).length !== 0) return false;
  try {
    buildWorkflowExecutionPlan(graph);
    return true;
  } catch {
    return false;
  }
}

export async function listWorkflowGraphs(): Promise<StoredWorkflowGraph[]> {
  const db = await openDatabase();
  const tx = db.transaction("workflowGraphs", "readonly");
  const rows = await requestResult(tx.objectStore("workflowGraphs").getAll()) as StoredWorkflowGraph[];
  await transactionComplete(tx);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorkflowGraph(id: string): Promise<StoredWorkflowGraph | undefined> {
  const db = await openDatabase();
  const tx = db.transaction("workflowGraphs", "readonly");
  const value = await requestResult(tx.objectStore("workflowGraphs").get(id)) as StoredWorkflowGraph | undefined;
  await transactionComplete(tx);
  return value;
}

export async function saveWorkflowGraph(value: unknown): Promise<StoredWorkflowGraph> {
  if (!validateStoredWorkflowGraph(value)) throw new WorkflowGraphRepositoryError("Hybrid workflow graph is invalid.");
  const db = await openDatabase();
  const tx = db.transaction("workflowGraphs", "readwrite");
  tx.objectStore("workflowGraphs").put(value);
  await transactionComplete(tx);
  return value;
}

export async function deleteWorkflowGraph(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction("workflowGraphs", "readwrite");
  tx.objectStore("workflowGraphs").delete(id);
  await transactionComplete(tx);
}
