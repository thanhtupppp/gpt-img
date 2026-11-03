import type { EngineAdapter, EngineJob } from "./types";

export interface EngineRuntimeHooks {
  save(job: EngineJob): Promise<void>;
  isCancelRequested(jobId: string): Promise<boolean>;
  onUpdate?(job: EngineJob): void;
}

const now = () => new Date().toISOString();

export async function executeEngineJob(
  initial: EngineJob,
  adapter: EngineAdapter,
  hooks: EngineRuntimeHooks,
): Promise<EngineJob> {
  if (initial.status !== "queued") throw new Error("Only queued jobs can be executed.");
  const controller = new AbortController();
  let job: EngineJob = {
    ...initial,
    status: "running",
    startedAt: now(),
    finishedAt: undefined,
    error: undefined,
    updatedAt: now(),
    logs: [...initial.logs, `Started with ${adapter.name}.`],
  };
  const persist = async () => {
    job = { ...job, updatedAt: now() };
    await hooks.save(job);
    hooks.onUpdate?.(job);
  };
  await persist();

  try {
    for (let index = 0; index < job.steps.length; index += 1) {
      if (await hooks.isCancelRequested(job.id)) {
        controller.abort();
        job = { ...job, status: "cancelled", cancelRequested: true, finishedAt: now(), logs: [...job.logs, "Execution cancelled by user."] };
        await persist();
        return job;
      }
      const step = job.steps[index];
      const result = await adapter.executeStep(step, {
        jobId: job.id,
        stepIndex: index,
        totalSteps: job.steps.length,
        attempt: job.attempt,
      }, controller.signal);
      job = {
        ...job,
        progress: Math.round(((index + 1) / job.steps.length) * 100),
        logs: [...job.logs, result.message],
      };
      if (await hooks.isCancelRequested(job.id)) {
        controller.abort();
        job = { ...job, status: "cancelled", cancelRequested: true, finishedAt: now(), logs: [...job.logs, "Execution cancelled by user."] };
        await persist();
        return job;
      }
      await persist();
    }
    job = { ...job, status: "succeeded", progress: 100, finishedAt: now(), logs: [...job.logs, "Workflow completed."] };
    await persist();
    return job;
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    job = {
      ...job,
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : error instanceof Error ? error.message : "Unknown execution error.",
      finishedAt: now(),
      logs: [...job.logs, cancelled ? "Execution cancelled." : "Execution failed."],
    };
    await persist();
    return job;
  }
}

export function createEngineJob(workflow: {
  id: string;
  name: string;
  steps: EngineJob["steps"];
}, id: string): EngineJob {
  const timestamp = now();
  return {
    id,
    workflowId: workflow.id,
    workflowName: workflow.name,
    steps: workflow.steps.map((step) => ({ ...step, parameters: { ...step.parameters } })),
    status: "queued",
    progress: 0,
    attempt: 1,
    logs: ["Added to local execution queue."],
    cancelRequested: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function retryEngineJob(job: EngineJob): EngineJob {
  if (job.status !== "failed" && job.status !== "cancelled") {
    throw new Error("Only failed or cancelled jobs can be retried.");
  }
  return {
    ...job,
    status: "queued",
    progress: 0,
    attempt: job.attempt + 1,
    logs: [...job.logs, `Retry attempt ${job.attempt + 1} queued.`],
    error: undefined,
    cancelRequested: false,
    startedAt: undefined,
    finishedAt: undefined,
    updatedAt: now(),
  };
}
