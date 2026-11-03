import { afterEach, describe, expect, it, vi } from "vitest";
import { executeGeminiImageStep, WorkflowImageExecutionError } from "./geminiImageExecution";
import type { WorkflowStep } from "../domain/types";

const step: WorkflowStep = { id: "step-1", commandId: "retouch", parameters: { prompt: "Retouch the product image" } };
const imageResponse = { model: "gemini-nano-banana-2.1", interaction_id: "interaction-1", image: { mime_type: "image/png", data: "aGVsbG8=" } };

afterEach(() => vi.restoreAllMocks());

describe("Gemini workflow image execution", () => {
  it("calls the same-origin Gateway with a source image and no credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(imageResponse), { status: 200 }));
    const result = await executeGeminiImageStep(step, { data: "c291cmNl", mimeType: "image/jpeg" });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/providers/gemini/images", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        prompt: "Retouch the product image",
        model: "gemini-nano-banana-2.1",
        aspect_ratio: "1:1",
        image_size: "1K",
        image_base64: "c291cmNl",
        mime_type: "image/jpeg",
      }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls[0][1]?.body)).not.toContain("API_KEY");
    expect(result.image).toEqual({ data: "aGVsbG8=", mimeType: "image/png" });
    expect(result.interactionId).toBe("interaction-1");
  });

  it("supports text-to-image nodes without an input image", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(imageResponse), { status: 200 }));
    await executeGeminiImageStep(step);
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("image_base64");
  });

  it("maps sanitized Gateway errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: { code: "PROVIDER_RATE_LIMITED", message: "Try again later." } }), { status: 429 }));
    await expect(executeGeminiImageStep(step)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", status: 429 });
  });

  it("rejects invalid input image types before network access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(executeGeminiImageStep(step, { data: "abc", mimeType: "image/gif" as "image/png" })).rejects.toBeInstanceOf(WorkflowImageExecutionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates request cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(executeGeminiImageStep(step, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects malformed Gateway image payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ image: { mime_type: "image/gif", data: "abc" } }), { status: 200 }));
    await expect(executeGeminiImageStep(step)).rejects.toMatchObject({ code: "INVALID_GATEWAY_IMAGE", status: 502 });
  });
});
