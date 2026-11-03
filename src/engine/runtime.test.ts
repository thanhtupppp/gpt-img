import { describe, expect, it, vi } from "vitest";
import type { EngineAdapter, EngineJob } from "./types";
import { createEngineJob, executeEngineJob, retryEngineJob } from "./runtime";

const workflow = {
  id: "workflow-1",
  name: "Test workflow",
  steps: [
    { id: "step-1", commandId: "analyze", parameters: {} },
    { id: "step-2", commandId: "retouch", parameters: { strength: "high" } },
  ],
};
const makeJob = () => createEngineJob(workflow, "job-1");
const adapter: EngineAdapter = {
  id: "test",
  name: "Test adapter",
  executeStep: vi.fn(async (step) => ({ message: `ran ${step.commandId}` })),
};

describe("PIECS Engine runtime", () => {
  it("creates a queued immutable workflow snapshot", () => {
    const job = makeJob();
    expect(job.status).toBe("queued");
    expect(job.progress).toBe(0);
    expect(job.steps).toEqual(workflow.steps);
    expect(job.steps).not.toBe(workflow.steps);
  });

  it("executes steps sequentially and records progress", async () => {
    const saved: EngineJob[] = [];
    const result = await executeEngineJob(makeJob(), adapter, {
      save: async (job) => { saved.push(job); },
      isCancelRequested: async () => false,
    });
    expect(result.status).toBe("succeeded");
    expect(result.progress).toBe(100);
    expect(result.logs).toContain("ran analyze");
    expect(result.logs).toContain("ran retouch");
    expect(saved.some((job) => job.progress === 50)).toBe(true);
  });

  it("marks a failed job and preserves the error for retry", async () => {
    const failing: EngineAdapter = {
      id: "failing",
      name: "Failing adapter",
      executeStep: async () => { throw new Error("provider unavailable"); },
    };
    const result = await executeEngineJob(makeJob(), failing, {
      save: async () => undefined,
      isCancelRequested: async () => false,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("provider unavailable");
    const retry = retryEngineJob(result);
    expect(retry.status).toBe("queued");
    expect(retry.attempt).toBe(2);
    expect(retry.error).toBeUndefined();
  });

  it("cancels between steps when the user requests cancellation", async () => {
    const result = await executeEngineJob(makeJob(), adapter, {
      save: async () => undefined,
      isCancelRequested: async () => true,
    });
    expect(result.status).toBe("cancelled");
    expect(result.progress).toBe(0);
  });

  it("rejects retrying a successful job", () => {
    expect(() => retryEngineJob({ ...makeJob(), status: "succeeded" })).toThrow("Only failed or cancelled");
  });
});
