export type GeminiImageModel =
  | "gemini-nano-banana-2.1"
  | "gemini-3.1-flash-image"
  | "gemini-3.1-flash-lite-image"
  | "gemini-3-pro-image";

export type ImageAspectRatio =
  | "1:1" | "1:4" | "1:8" | "2:3" | "3:2" | "3:4"
  | "4:1" | "4:3" | "4:5" | "5:4" | "8:1" | "9:16" | "16:9" | "21:9";

export interface GeminiImageRequest {
  prompt: string;
  model: GeminiImageModel;
  aspect_ratio: ImageAspectRatio;
  image_size: "1K" | "2K" | "4K";
  image_base64?: string;
  mime_type?: "image/png" | "image/jpeg" | "image/webp";
}

export interface GeminiImageResponse {
  provider: "gemini";
  model: string;
  interaction_id?: string | null;
  image: { mime_type: string; data: string };
}

export interface GeminiConnectionResponse {
  provider: "gemini";
  model: string;
  available: boolean;
}

export class ImageApiError extends Error {
  constructor(message: string, readonly code = "REQUEST_FAILED", readonly status = 0) {
    super(message);
    this.name = "ImageApiError";
  }
}

const API_ROOT = "/api/v1/providers/gemini";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ImageApiError("Không thể kết nối Gateway. Kiểm tra dịch vụ hoặc cấu hình reverse proxy.", "GATEWAY_UNREACHABLE");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? (payload as { detail?: unknown }).detail
      : undefined;
    const error = detail && typeof detail === "object"
      ? detail as { code?: string; message?: string }
      : undefined;
    throw new ImageApiError(
      error?.message || (typeof detail === "string" ? detail : "Gateway từ chối yêu cầu."),
      error?.code || "GATEWAY_ERROR",
      response.status,
    );
  }
  return payload as T;
}

export function testGeminiConnection(): Promise<GeminiConnectionResponse> {
  return request("/test", { method: "POST" });
}

export function generateGeminiImage(input: GeminiImageRequest): Promise<GeminiImageResponse> {
  return request("/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
