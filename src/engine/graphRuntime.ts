import type { WorkflowStep } from "../domain/types";
import type { WorkflowGraph } from "./workflowGraph";
import type { WorkflowImage } from "./geminiImageExecution";

export type GraphNodeStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "blocked" | "interrupted";

export interface GraphNodeRecord {
  nodeId: string;
  status: GraphNodeStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  error?: string;
}

export interface GraphExecutionSnapshot {
  graphId: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  progress: number;
  nodes: GraphNodeRecord[];
  logs: string[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface WorkflowNodeOutput {
  message: string;
  image?: WorkflowImage;
  metadata?: Record<string, string | number | boolean>;
}

export interface GraphStepContext {
  graphId: string;
  nodeId: string;
  attempt: number;
  /** Successful direct-parent outputs, keyed by parent node id. Image bytes remain in memory only. */
  inputs: Readonly<Record<string, WorkflowNodeOutput>>;
}

export interface GraphExecutionAdapter {
  readonly id: string;
  readonly name: string;
  executeStep(step: WorkflowStep, context: GraphStepContext, signal: AbortSignal): Promise<WorkflowNodeOutput>;
}

export interface GraphExecutionHooks {
  save(snapshot: GraphExecutionSnapshot): Promise<void>;
  isCancelRequested(graphId: string): Promise<boolean>;
  onUpdate?(snapshot: GraphExecutionSnapshot): void;
}

export interface GraphExecutionOptions {
  maxConcurrency?: number;
  attempt?: number;
  graphId?: string;
}

const timestamp = () => new Date().toISOString();
const cloneSnapshot = (snapshot: GraphExecutionSnapshot): GraphExecutionSnapshot => ({
  ...snapshot,
  nodes: snapshot.nodes.map((node) => ({ ...node })),
  logs: [...snapshot.logs],
});

export class GraphExecutionError extends Error {
  constructor(message: string, readonly code: "GRAPH_FAILED" | "GRAPH_CANCELLED" | "INVALID_CONCURRENCY") {
    super(message);
    this.name = "GraphExecutionError";
  }
}

/**
 * Executes a validated DAG wave-by-wave. Nodes in a wave run concurrently (up to
 * maxConcurrency); the next wave, including a join, starts only after every node
 * in the current wave succeeds. Image outputs are kept in memory and never added
 * to persisted execution snapshots.
 */
export async function executeWorkflowGraph(
  graph: WorkflowGraph,
  adapter: GraphExecutionAdapter,
  hooks: GraphExecutionHooks,
  options: GraphExecutionOptions = {},
): Promise<GraphExecutionSnapshot> {
  const plan = buildWorkflowExecutionPlan(graph);
  const maxConcurrency = options.maxConcurrency ?? 4;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new GraphExecutionError("maxConcurrency must be a positive integer.", "INVALID_CONCURRENCY");
  }

  const controller = new AbortController();
  const records = new Map<string, GraphNodeRecord>(
    graph.nodes.map((node) => [node.id, { nodeId: node.id, status: "pending" }]),
  );
  const outputs = new Map<string, WorkflowNodeOutput>();
  const snapshot: GraphExecutionSnapshot = {
    graphId: options.graphId ?? crypto.randomUUID(),
    status: "running",
    progress: 0,
    nodes: graph.nodes.map((node) => records.get(node.id)!),
    logs: [`Started graph execution with ${adapter.name}.`],
    startedAt: timestamp(),
    updatedAt: timestamp(),
  };

  let persistQueue = Promise.resolve();
  const persist = async () => {
    persistQueue = persistQueue.then(async () => {
      snapshot.nodes = graph.nodes.map((node) => ({ ...records.get(node.id)! }));
      snapshot.progress = Math.round(
        (snapshot.nodes.filter((node) => node.status === "succeeded").length / graph.nodes.length) * 100,
      );
      snapshot.updatedAt = timestamp();
      const persisted = cloneSnapshot(snapshot);
      await hooks.save(persisted);
      hooks.onUpdate?.(cloneSnapshot(persisted));
    });
    await persistQueue;
  };

  const parents = new Map<string, string[]>();
  graph.nodes.forEach((node) => parents.set(node.id, []));
  graph.edges.forEach((edge) => parents.get(edge.to)?.push(edge.from));

  await persist();
  try {
    for (const wave of plan.waves) {
      if (await hooks.isCancelRequested(snapshot.graphId)) {
        controller.abort();
        throw new GraphExecutionError("Workflow execution cancelled by user.", "GRAPH_CANCELLED");
      }

      let cursor = 0;
      let waveFailure: unknown;
      const worker = async () => {
        while (cursor < wave.length && !waveFailure && !controller.signal.aborted) {
          if (await hooks.isCancelRequested(snapshot.graphId)) {
            waveFailure = new GraphExecutionError("Workflow execution cancelled by user.", "GRAPH_CANCELLED");
            controller.abort();
            break;
          }
          const step = wave[cursor++];
          const record = records.get(step.id)!;
          record.status = "running";
          record.startedAt = timestamp();
          snapshot.logs.push(`Started node ${step.id}.`);
          await persist();
          try {
            const inputs: Record<string, WorkflowNodeOutput> = {};
            for (const parentId of parents.get(step.id) ?? []) {
              const output = outputs.get(parentId);
              if (output) inputs[parentId] = output;
            }
            const output = await adapter.executeStep(step, {
              graphId: snapshot.graphId,
              nodeId: step.id,
              attempt: options.attempt ?? 1,
              inputs,
            }, controller.signal);
            outputs.set(step.id, output);
            record.status = "succeeded";
            record.message = output.message;
            record.finishedAt = timestamp();
            snapshot.logs.push(`Completed node ${step.id}.`);
            await persist();
          } catch (error) {
            record.status = error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
            record.error = error instanceof Error ? error.message : "Unknown node execution error.";
            record.finishedAt = timestamp();
            waveFailure ??= error;
            controller.abort();
            snapshot.logs.push(`Node ${step.id} failed.`);
            await persist();
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(maxConcurrency, wave.length) }, () => worker()));
      if (waveFailure) throw waveFailure;
    }

    snapshot.status = "succeeded";
    snapshot.progress = 100;
    snapshot.logs.push("Workflow graph completed.");
    snapshot.finishedAt = timestamp();
    await persist();
    return cloneSnapshot(snapshot);
  } catch (error) {
    const cancelled = error instanceof GraphExecutionError && error.code === "GRAPH_CANCELLED"
      || error instanceof DOMException && error.name === "AbortError";
    for (const record of records.values()) {
      if (record.status === "pending") record.status = cancelled ? "cancelled" : "blocked";
      if (record.status === "running") {
        record.status = cancelled ? "cancelled" : "failed";
        record.finishedAt = timestamp();
      }
    }
    snapshot.status = cancelled ? "cancelled" : "failed";
    snapshot.error = error instanceof Error ? error.message : "Unknown workflow execution error.";
    snapshot.logs.push(cancelled ? "Workflow graph cancelled." : "Workflow graph failed; dependent waves were not started.");
    snapshot.finishedAt = timestamp();
    await persist();
    return cloneSnapshot(snapshot);
  }
}

import { buildWorkflowExecutionPlan } from "./workflowGraph";

