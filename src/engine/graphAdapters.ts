import type { WorkflowStep } from "../domain/types";
import { executeGeminiImageStep, type GeminiStepOptions } from "./geminiImageExecution";
import type { GraphExecutionAdapter, GraphStepContext, WorkflowNodeOutput } from "./graphRuntime";

export const demoGraphAdapter: GraphExecutionAdapter = {
  id: "demo-graph",
  name: "Local Demo Graph Adapter",
  async executeStep(step, context, signal) {
    if (signal.aborted) throw new DOMException("Execution cancelled.", "AbortError");
    await Promise.resolve();
    if (signal.aborted) throw new DOMException("Execution cancelled.", "AbortError");
    return {
      message: `Demo completed / ${step.commandId} (${context.nodeId}). No provider request was made.`,
      metadata: { adapter: "demo-graph" },
    };
  },
};

function selectInputImage(step: WorkflowStep, context: GraphStepContext) {
  const requestedParent = step.parameters.input_from;
  if (typeof requestedParent === "string" && requestedParent.trim()) {
    const output = context.inputs[requestedParent];
    if (!output?.image) throw new Error(`Configured input_from node "${requestedParent}" has no image output.`);
    return output.image;
  }
  for (const output of Object.values(context.inputs)) {
    if (output.image) return output.image;
  }
  return undefined;
}

/** Bridges graph nodes to the existing same-origin Gemini Gateway adapter. */
export function createGeminiGraphAdapter(options: Omit<GeminiStepOptions, "signal"> = {}): GraphExecutionAdapter {
  return {
    id: "gemini-graph",
    name: "Gemini Image Adapter",
    async executeStep(step, context, signal): Promise<WorkflowNodeOutput> {
      const inputImage = selectInputImage(step, context);
      const result = await executeGeminiImageStep(step, inputImage, { ...options, signal });
      return {
        message: `Gemini completed ${step.commandId} with ${result.model}.`,
        image: result.image,
        metadata: result.interactionId ? { interactionId: result.interactionId } : undefined,
      };
    },
  };
}
