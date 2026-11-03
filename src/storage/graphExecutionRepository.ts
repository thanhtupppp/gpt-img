import type { GraphExecutionSnapshot } from "../engine/graphRuntime";
import { openDatabase, requestResult, transactionComplete } from "./database";

/** Persist only execution metadata. Runtime image outputs and provider credentials are never accepted. */
function metadataOnly(snapshot: GraphExecutionSnapshot): GraphExecutionSnapshot {
  return {
    graphId: snapshot.graphId,
    status: snapshot.status,
    progress: snapshot.progress,
    nodes: snapshot.nodes.map((node) => ({
      nodeId: node.nodeId,
      status: node.status,
      startedAt: node.startedAt,
      finishedAt: node.finishedAt,
      message: node.message,
      error: node.error,
      ...(node.assetId ? { assetId: node.assetId } : {}),
    })),
    logs: [...snapshot.logs],
    startedAt: snapshot.startedAt,
    updatedAt: snapshot.updatedAt,
    finishedAt: snapshot.finishedAt,
    error: snapshot.error,
  };
}

export async function saveGraphExecution(snapshot: GraphExecutionSnapshot): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("graphExecutions", "readwrite");
  transaction.objectStore("graphExecutions").put(metadataOnly(snapshot));
  await transactionComplete(transaction);
}

export async function getGraphExecution(graphId: string): Promise<GraphExecutionSnapshot | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction("graphExecutions", "readonly");
  const result = await requestResult(transaction.objectStore("graphExecutions").get(graphId)) as GraphExecutionSnapshot | undefined;
  await transactionComplete(transaction);
  return result ? metadataOnly(result) : undefined;
}

export async function listGraphExecutions(): Promise<GraphExecutionSnapshot[]> {
  const database = await openDatabase();
  const transaction = database.transaction("graphExecutions", "readonly");
  const result = await requestResult(transaction.objectStore("graphExecutions").getAll()) as GraphExecutionSnapshot[];
  await transactionComplete(transaction);
  return result.map(metadataOnly).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Reconcile executions left running by a closed tab or browser restart.
 * This is metadata recovery only: it deliberately never replays provider calls.
 */
export async function recoverInterruptedGraphExecutions(): Promise<GraphExecutionSnapshot[]> {
  const database = await openDatabase();
  const transaction = database.transaction("graphExecutions", "readwrite");
  const store = transaction.objectStore("graphExecutions");
  const records = await requestResult(store.getAll()) as GraphExecutionSnapshot[];
  const recovered = records.map((record) => {
    if (record.status !== "running") return metadataOnly(record);
    const updatedAt = new Date().toISOString();
    const next: GraphExecutionSnapshot = {
      ...metadataOnly(record),
      status: "interrupted",
      nodes: record.nodes.map((node) => node.status === "running"
        ? { ...node, status: "interrupted", finishedAt: updatedAt, error: "Execution was interrupted before the node completed." }
        : { ...node }),
      updatedAt,
      finishedAt: updatedAt,
      error: "Execution was interrupted by an application or browser shutdown. No automatic retry was performed.",
      logs: [...record.logs, "Execution recovered as interrupted; pending provider calls were not replayed."],
    };
    store.put(next);
    return next;
  });
  await transactionComplete(transaction);
  return recovered.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function deleteGraphExecution(graphId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("graphExecutions", "readwrite");
  transaction.objectStore("graphExecutions").delete(graphId);
  await transactionComplete(transaction);
}
