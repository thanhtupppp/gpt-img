# P8 PR #19 — Gemini / Nano Banana Adapter

## Provider endpoints

All routes inherit the authenticated provider-management boundary and require:

`Authorization: Bearer <PIECS_ADMIN_TOKEN>`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/providers/gemini/test` | Verify the stored Gemini API key against the Gemini Models API |
| POST | `/api/v1/providers/gemini/images` | Generate an image or edit a supplied image |

## Configuration

Reuse PR #18 settings:

- `PIECS_ADMIN_TOKEN`
- `PIECS_SECRET_ENCRYPTION_KEY`
- `PIECS_DATABASE_PATH`

Save the Gemini API key using `PUT /api/v1/providers/gemini/credentials`. The adapter reads it from the encrypted vault at request time and sends it to Google only in the `x-goog-api-key` header.

## Image request

Example text-to-image request:

```json
{
  "prompt": "A premium studio product photograph of a ceramic coffee mug",
  "model": "gemini-nano-banana-2.1",
  "aspect_ratio": "4:5",
  "image_size": "2K"
}
```

Example image-edit request adds `image_base64` and `mime_type`:

```json
{
  "prompt": "Remove the background and preserve the product exactly",
  "image_base64": "<base64-encoded-image>",
  "mime_type": "image/png",
  "model": "gemini-nano-banana-2.1",
  "aspect_ratio": "1:1",
  "image_size": "1K"
}
```

Supported models: `gemini-nano-banana-2.1` (default), `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, and `gemini-3-pro-image`. Supported input formats are PNG, JPEG, and WebP. Supported aspect ratios and image sizes are allowlisted by the adapter.

The response contains the provider, selected model, upstream interaction ID, and generated image as base64 plus MIME type. Store or display the image through a later asset workflow; this PR does not persist generated assets.

## Error handling and security

- API keys are loaded from the encrypted vault and never accepted in generation request bodies.
- The key is sent only as the `x-goog-api-key` header over HTTPS.
- Upstream error bodies are never returned or logged; errors are mapped to stable sanitized codes.
- Connection timeouts, provider rate limits, invalid credentials, and missing image outputs have distinct error codes.
- Requests reject unknown fields, unsupported models, MIME types, aspect ratios, and image sizes.
- Image edit input is base64-validated and limited by request field size.
- Routes use the existing admin bearer boundary; this is not yet end-user/tenant authentication or a public generation quota system.

## Official API references

- [Nano Banana image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini Nano Banana 2.1 model](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1)
