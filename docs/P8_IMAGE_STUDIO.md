# P8 PR #20 — Image Studio UI

## Scope

Adds a dedicated Image Studio page for text-to-image generation and reference-image editing through the Gemini adapter from PR #19. Prompt Studio, local template storage, and the local Demo Engine remain usable independently.

## Browser API contract

The UI calls same-origin endpoints:

- `POST /api/v1/providers/gemini/test`
- `POST /api/v1/providers/gemini/images`

It does not call Google directly and never asks for or stores a Gemini API key. The gateway admin bearer token must be injected by a trusted server-side reverse proxy/session boundary. Do not configure `PIECS_ADMIN_TOKEN` as a `VITE_*` variable and do not expose it to browser JavaScript.

Production routing must forward these paths to the FastAPI Gateway and inject `Authorization: Bearer <PIECS_ADMIN_TOKEN>` server-side after authenticating the application session. The browser must not be able to override the injected authorization header. Restrict CORS and apply session authorization, CSRF protection where cookie sessions are used, request limits, and rate limiting at the edge.

For local development, configure a trusted local reverse proxy that injects the admin token from server-side environment configuration. Do not put the token in Vite client env or local storage.

## User capabilities

- Select one of the allowlisted Gemini image models.
- Enter a prompt up to 12,000 characters.
- Optionally upload PNG, JPEG, or WebP reference image up to 10 MB.
- Choose an allowlisted aspect ratio and 1K/2K/4K output size.
- Test the provider connection.
- View the returned image and download it.

The generated image is held in a temporary browser object URL only. This PR does not persist images, create an asset library, or add multi-step image history; those belong to later roadmap work.

## Privacy and security

- No provider credentials in browser storage, IndexedDB, URL, logs, or generation payloads.
- Upload preview uses a temporary object URL and revokes it on replacement/unmount.
- Gateway errors are displayed from sanitized error envelopes.
- The UI limits reference uploads to 10 MB and accepted raster MIME types.
- Gateway admin authentication is not implemented in browser code; it is a deployment responsibility of a trusted reverse proxy/session layer.

## Validation

The client API unit tests mock fetch and verify same-origin routing, sanitized error mapping, and absence of API keys. Playwright covers navigation, input validation, image selection, and the UI state without requiring a live Gemini credential.
