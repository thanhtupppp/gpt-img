# P10 PR #25 — Workflow Asset Integration

## Scope
- Persist successful workflow image outputs in the separate IndexedDB `assets` store.
- Associate generated assets with the graph execution ID and producing node ID.
- Store the resulting asset ID in execution node metadata; execution history never stores image bytes or Blobs.
- Allow Gemini graph nodes to explicitly load an existing Asset Library image using `parameters.input_asset_id`.
- Preserve existing direct-parent image handoff and legacy sequential workflows.

## Data flow
1. An adapter returns a `WorkflowImage` output.
2. The graph runtime converts its base64 payload to a Blob and stores it as a workflow asset.
3. The node record stores only `assetId`; the in-memory output remains available to dependent nodes for the current run.
4. A Gemini node with `input_asset_id` loads that asset and sends its bytes through the existing same-origin Gateway request.

## Safety and compatibility
- Asset blobs remain in the `assets` object store, separate from `graphExecutions`.
- Execution snapshots persist only metadata and asset references.
- Missing explicit asset references fail clearly; they do not silently fall back to another input.
- Existing workflows without `input_asset_id` retain their previous direct-parent input behavior.
- Interrupted executions are not replayed automatically.
- This PR does not add Asset Library UI or cloud synchronization.

## Validation
- Workflow image output persistence and graph/node association.
- Metadata-only execution history.
- Explicit saved-asset input to Gemini.
- Missing asset reference behavior.
