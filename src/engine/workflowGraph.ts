import type { WorkflowStep } from "../domain/types";

export interface WorkflowGraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface WorkflowGraph {
  schemaVersion: "1.0.0";
  nodes: WorkflowStep[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphIssue {
  code: "EMPTY_GRAPH" | "DUPLICATE_NODE" | "DUPLICATE_EDGE" | "MISSING_NODE" | "SELF_REFERENCE" | "CYCLE";
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface WorkflowExecutionPlan {
  /** Each wave contains nodes that can execute concurrently. */
  waves: WorkflowStep[][];
  nodeCount: number;
  edgeCount: number;
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowGraphIssue[] {
  const issues: WorkflowGraphIssue[] = [];
  if (graph.nodes.length === 0) {
    issues.push({ code: "EMPTY_GRAPH", message: "A workflow graph must contain at least one node." });
    return issues;
  }

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE", message: `Duplicate node id: ${node.id}`, nodeId: node.id });
    }
    nodeIds.add(node.id);
  }

  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.from}\u0000${edge.to}`;
    if (edgeKeys.has(key)) {
      issues.push({ code: "DUPLICATE_EDGE", message: `Duplicate edge: ${edge.from} -> ${edge.to}`, edgeId: edge.id });
    }
    edgeKeys.add(key);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ code: "MISSING_NODE", message: `Edge ${edge.id} references a missing node.`, edgeId: edge.id });
    }
    if (edge.from === edge.to) {
      issues.push({ code: "SELF_REFERENCE", message: `Node ${edge.from} cannot depend on itself.`, nodeId: edge.from, edgeId: edge.id });
    }
  }

  if (issues.length > 0) return issues;
  try {
    buildWorkflowExecutionPlan(graph);
  } catch {
    issues.push({ code: "CYCLE", message: "Workflow graph contains a dependency cycle." });
  }
  return issues;
}

/**
 * Builds deterministic topological execution waves. Nodes in the same wave have
 * no dependency path between them and may be executed concurrently. Node order
 * within a wave follows the source graph's node order.
 */
export function buildWorkflowExecutionPlan(graph: WorkflowGraph): WorkflowExecutionPlan {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) throw new Error("Workflow graph contains duplicate node ids.");
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error("Workflow graph edge references a missing node.");
    if (edge.from === edge.to) throw new Error("Workflow graph contains a self-reference.");
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  graph.nodes.forEach((node) => {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  });
  graph.edges.forEach((edge) => {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  });

  const waves: WorkflowStep[][] = [];
  const completed = new Set<string>();
  while (completed.size < graph.nodes.length) {
    const ready = graph.nodes.filter((node) => !completed.has(node.id) && incoming.get(node.id) === 0);
    if (ready.length === 0) throw new Error("Workflow graph contains a dependency cycle.");
    waves.push(ready);
    for (const node of ready) {
      completed.add(node.id);
      for (const next of outgoing.get(node.id) ?? []) {
        incoming.set(next, (incoming.get(next) ?? 0) - 1);
      }
    }
  }

  return { waves, nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
}
