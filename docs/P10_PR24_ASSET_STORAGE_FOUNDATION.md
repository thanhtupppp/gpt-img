# P10 PR #24 — Asset Storage Foundation

## Scope
- Upgrade the existing IndexedDB database from version 4 to 5 without deleting or rewriting existing stores.
- Add a dedicated `assets` object store for durable image Blobs.
- Add a typed asset repository with create, get, list, and delete operations.
- Support PNG, JPEG, and WebP images up to 25 MB.
- Associate workflow-produced assets with both a graph execution ID and node ID.
- Return metadata-only results from list operations; load image bytes explicitly with `getAsset`.

## Storage and privacy boundaries
- Image Blobs live only in the dedicated `assets` store.
- Graph execution history remains metadata-only and does not embed image bytes.
- The repository does not accept provider credentials or arbitrary metadata payloads.
- Uploaded assets cannot claim workflow provenance; workflow assets require both graphId and nodeId.
- This is browser-local IndexedDB storage, not cloud sync or backup.

## Deliberate non-goals
- No Image Studio or workflow UI integration in this PR.
- No automatic migration of transient P9 outputs.
- No object URL lifecycle management or image thumbnail generation.
- No cross-device synchronization or quota-management UI.

## Validation
Tests cover Blob round-trip, metadata-only listing, workflow provenance, invalid MIME/name/size, missing provenance, and deletion.
