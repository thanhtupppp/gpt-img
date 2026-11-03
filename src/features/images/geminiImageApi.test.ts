import { afterEach, describe, expect, it, vi } from "vitest";
import { generateGeminiImage, ImageApiError, testGeminiConnection } from "./geminiImageApi";

afterEach(() => vi.unstubAllGlobals());

describe("Gemini image API client", () => {
  it("tests the configured provider without sending credentials from the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      provider: "gemini", model: "gemini-nano-banana-2.1", available: true,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(testGeminiConnection()).resolves.toMatchObject({ available: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/providers/gemini/test", expect.objectContaining({ method: "POST" }));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("api_key");
  });

  it("posts generation payload to the same-origin gateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      provider: "gemini", model: "gemini-nano-banana-2.1",
      image: { mime_type: "image/png", data: "cG5n" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await generateGeminiImage({ prompt: "A product photo", model: "gemini-nano-banana-2.1", aspect_ratio: "1:1", image_size: "1K" });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/providers/gemini/images", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("A product photo");
    expect(String(init.body)).not.toContain("api_key");
  });

  it("maps sanitized gateway error envelopes to typed errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code: "CREDENTIAL_NOT_CONFIGURED", message: "Configure a Gemini API key first." },
    }), { status: 409, headers: { "Content-Type": "application/json" } })));
    await expect(testGeminiConnection()).rejects.toMatchObject({
      name: "ImageApiError", code: "CREDENTIAL_NOT_CONFIGURED", status: 409,
    } satisfies Partial<ImageApiError>);
  });

  it("returns a clear error when the gateway cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(testGeminiConnection()).rejects.toMatchObject({ code: "GATEWAY_UNREACHABLE" });
  });
});
