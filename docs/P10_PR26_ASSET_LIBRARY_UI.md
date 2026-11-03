# P10 PR #26 — Asset Library UI

## Scope
- Add an Asset Library page to the main workspace navigation.
- List upload and workflow-generated asset metadata from IndexedDB.
- Search by name, MIME type, source, graph ID, and node ID.
- Upload PNG, JPEG, and WebP files with the repository's 25 MB validation.
- Load image bytes only when the user opens the full-size preview.
- Confirm before deleting an asset.
- Keep image Blobs in the dedicated `assets` object store; execution history remains metadata-only.

## Storage and privacy
- The list view uses `listAssets()`, which returns metadata only.
- `getAsset()` is called only for an explicit preview action.
- Object URLs are revoked when the preview changes or unmounts.
- No cloud synchronization or browser-side provider credentials are introduced.

## Workflow handoff
- Generated workflow assets retain their graph and node provenance.
- Asset IDs can be copied from the library. Workflow nodes already support `parameters.input_asset_id` through the Gemini graph adapter (P10 PR #25).

## Validation
- Existing asset repository tests cover metadata-only listing, Blob roundtrip, provenance, validation, and deletion.
- CI validates TypeScript, unit tests, browser acceptance, and production build.
