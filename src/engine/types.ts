import type { WorkflowStep } from "../domain/types";

export type EngineJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface EngineJob {
  id: string;
  workflowId: string;
  workflowName: string;
  steps: WorkflowStep[];
  status: EngineJobStatus;
  progress: number;
  attempt: number;
  logs: string[];
  error?: string;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface EngineStepContext {
  jobId: string;
  stepIndex: number;
  totalSteps: number;
  attempt: number;
}

export interface EngineStepResult {
  message: string;
}

export interface EngineAdapter {
  readonly id: string;
  readonly name: string;
  executeStep(step: WorkflowStep, context: EngineStepContext, signal: AbortSignal): Promise<EngineStepResult>;
}
