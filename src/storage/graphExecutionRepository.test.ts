import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { GraphExecutionSnapshot } from "../engine/graphRuntime";
import { closeDatabaseForTests } from "./database";
import {
  deleteGraphExecution,
  getGraphExecution,
  listGraphExecutions,
  recoverInterruptedGraphExecutions,
  saveGraphExecution,
} from "./graphExecutionRepository";

afterEach(async () => {
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

const snapshot = (overrides: Partial<GraphExecutionSnapshot> = {}): GraphExecutionSnapshot => ({
  graphId: "graph-1",
  status: "running",
  progress: 25,
  nodes: [
    { nodeId: "done", status: "succeeded", message: "finished" },
    { nodeId: "active", status: "running" },
    { nodeId: "waiting", status: "pending" },
  ],
  logs: ["Started graph."],
  startedAt: "2026-11-03T08:00:00.000Z",
  updatedAt: "2026-11-03T08:01:00.000Z",
  ...overrides,
});

describe("graph execution history repository", () => {
  it("persists, retrieves, sorts, and deletes metadata snapshots", async () => {
    await saveGraphExecution(snapshot());
    await saveGraphExecution(snapshot({ graphId: "graph-2", startedAt: "2026-11-03T09:00:00.000Z" }));
    expect((await listGraphExecutions()).map((item) => item.graphId)).toEqual(["graph-2", "graph-1"]);
    expect((await getGraphExecution("graph-1"))?.nodes).toHaveLength(3);
    await deleteGraphExecution("graph-1");
    expect(await getGraphExecution("graph-1")).toBeUndefined();
  });

  it("marks stale running records interrupted without replaying pending work", async () => {
    await saveGraphExecution(snapshot());
    const [recovered] = await recoverInterruptedGraphExecutions();
    expect(recovered.status).toBe("interrupted");
    expect(recovered.nodes.map((node) => node.status)).toEqual(["succeeded", "interrupted", "pending"]);
    expect(recovered.error).toContain("No automatic retry");
    expect((await getGraphExecution("graph-1"))?.status).toBe("interrupted");
  });

  it("does not rewrite completed history during recovery", async () => {
    const completed = snapshot({ status: "succeeded", progress: 100, finishedAt: "2026-11-03T08:02:00.000Z" });
    await saveGraphExecution(completed);
    const [recovered] = await recoverInterruptedGraphExecutions();
    expect(recovered).toEqual(completed);
  });

  it("persists only the documented metadata whitelist", async () => {
    const unsafe = { ...snapshot(), image: { data: "private-image-bytes" }, apiKey: "secret" } as unknown as GraphExecutionSnapshot;
    await saveGraphExecution(unsafe);
    const stored = await getGraphExecution("graph-1");
    expect(JSON.stringify(stored)).not.toContain("private-image-bytes");
    expect(JSON.stringify(stored)).not.toContain("secret");
  });
});
