import type { WorkflowStep } from "../domain/types";

export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp";
export type SupportedImageModel =
  | "gemini-nano-banana-2.1"
  | "gemini-3.1-flash-image"
  | "gemini-3.1-flash-lite-image"
  | "gemini-3-pro-image";

export interface WorkflowImage {
  data: string;
  mimeType: SupportedImageMimeType;
}

export interface GeminiStepOptions {
  model?: SupportedImageModel;
  aspectRatio?: string;
  imageSize?: "1K" | "2K" | "4K";
  signal?: AbortSignal;
}

export interface GeminiStepResult {
  image: WorkflowImage;
  model: string;
  interactionId?: string | null;
}

export class WorkflowImageExecutionError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "WorkflowImageExecutionError";
  }
}

const DEFAULT_MODEL: SupportedImageModel = "gemini-nano-banana-2.1";
const MIME_TYPES = new Set<SupportedImageMimeType>(["image/png", "image/jpeg", "image/webp"]);
const ASPECT_RATIOS = new Set(["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"]);

function readTextParameter(step: WorkflowStep, key: string): string | undefined {
  const value = step.parameters[key];
  return typeof value === "string" ? value : undefined;
}

/** Executes one image-processing node through the same-origin Gateway. No provider secret enters browser code. */
export async function executeGeminiImageStep(
  step: WorkflowStep,
  inputImage?: WorkflowImage,
  options: GeminiStepOptions = {},
): Promise<GeminiStepResult> {
  const prompt = readTextParameter(step, "prompt") ?? readTextParameter(step, "instruction") ?? step.commandId;
  if (!prompt.trim()) throw new WorkflowImageExecutionError("Workflow step prompt is empty.", "EMPTY_PROMPT", 400);
  const aspectRatio = options.aspectRatio ?? readTextParameter(step, "aspect_ratio") ?? "1:1";
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new WorkflowImageExecutionError("Unsupported image aspect ratio.", "INVALID_IMAGE_OPTIONS", 400);
  if (inputImage && !MIME_TYPES.has(inputImage.mimeType)) {
    throw new WorkflowImageExecutionError("Use PNG, JPEG, or WebP workflow images.", "UNSUPPORTED_IMAGE_TYPE", 400);
  }

  let response: Response;
  try {
    response = await fetch("/api/v1/providers/gemini/images", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        prompt,
        model: options.model ?? DEFAULT_MODEL,
        aspect_ratio: aspectRatio,
        image_size: options.imageSize ?? "1K",
        ...(inputImage ? { image_base64: inputImage.data, mime_type: inputImage.mimeType } : {}),
      }),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new WorkflowImageExecutionError("Không thể kết nối Gateway. Kiểm tra dịch vụ hoặc reverse proxy.", "GATEWAY_UNREACHABLE", 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail?: unknown }).detail : undefined;
    const envelope = detail && typeof detail === "object" ? detail as { code?: string; message?: string } : undefined;
    throw new WorkflowImageExecutionError(
      envelope?.message || (typeof detail === "string" ? detail : "Gateway từ chối yêu cầu."),
      envelope?.code || "GATEWAY_ERROR",
      response.status,
    );
  }

  if (!payload || typeof payload !== "object" || !("image" in payload)) {
    throw new WorkflowImageExecutionError("Gateway returned an invalid image response.", "INVALID_GATEWAY_RESPONSE", 502);
  }
  const result = payload as { model?: string; interaction_id?: string | null; image?: { mime_type?: string; data?: string } };
  if (!result.image?.data || !MIME_TYPES.has(result.image.mime_type as SupportedImageMimeType)) {
    throw new WorkflowImageExecutionError("Gateway returned an unsupported or empty image.", "INVALID_GATEWAY_IMAGE", 502);
  }
  return {
    image: { data: result.image.data, mimeType: result.image.mime_type as SupportedImageMimeType },
    model: result.model || options.model || DEFAULT_MODEL,
    interactionId: result.interaction_id,
  };
}
