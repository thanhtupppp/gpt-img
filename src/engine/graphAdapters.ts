import type { WorkflowStep } from "../domain/types";
import { executeGeminiImageStep, type GeminiStepOptions, type WorkflowImage } from "./geminiImageExecution";
import { getAsset } from "../storage/assetRepository";
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

async function selectInputImage(step: WorkflowStep, context: GraphStepContext): Promise<WorkflowImage | undefined> {
  const assetId = step.parameters.input_asset_id;
  if (typeof assetId === "string" && assetId.trim()) {
    const asset = await getAsset(assetId.trim());
    if (!asset) throw new Error('Configured input_asset_id "' + assetId + '" was not found in Asset Library.');
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return { data: btoa(binary), mimeType: asset.mimeType };
  }
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
      const inputImage = await selectInputImage(step, context);
      const result = await executeGeminiImageStep(step, inputImage, { ...options, signal });
      return {
        message: `Gemini completed ${step.commandId} with ${result.model}.`,
        image: result.image,
        metadata: result.interactionId ? { interactionId: result.interactionId } : undefined,
      };
    },
  };
}
