import type { EngineAdapter } from "./types";

export const demoAdapter: EngineAdapter = {
  id: "demo-local",
  name: "Local Demo Adapter",
  async executeStep(step, context, signal) {
    if (signal.aborted) throw new DOMException("Execution cancelled.", "AbortError");
    await Promise.resolve();
    if (signal.aborted) throw new DOMException("Execution cancelled.", "AbortError");
    return {
      message: `Demo completed / ${step.commandId} (${context.stepIndex + 1}/${context.totalSteps}). No provider request was made.`,
    };
  },
};
