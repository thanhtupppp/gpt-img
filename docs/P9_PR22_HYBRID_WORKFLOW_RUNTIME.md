# P9 PR #22 — Hybrid Workflow Runtime

## Scope

PR #22 adds the runtime scheduler for the graph contract introduced in PR #21. It is intentionally separate from the legacy sequential `executeEngineJob` path, so existing IndexedDB workflows and the Demo Adapter remain compatible.

## Execution semantics

- The graph is validated and planned into deterministic topological waves.
- Nodes in one wave run concurrently, limited by `maxConcurrency` (default: 4).
- A dependent wave starts only after every node in the current wave succeeds. A join therefore waits for all direct parents.
- On a node failure, the shared abort signal is triggered, the current wave is settled, and dependent nodes are marked blocked rather than executed.
- Cancellation is checked before each wave and before each node is claimed. Adapters receive the shared `AbortSignal` and should stop in-flight work when aborted.
- The runtime returns a compact execution snapshot with per-node state, progress, timestamps, and sanitized error text.

## Image handoff and persistence

Successful node outputs are retained in an in-memory map for the lifetime of the execution. Each node receives the outputs of its direct parents, keyed by parent node id. The Gemini graph adapter selects an image from `parameters.input_from` when configured, otherwise it uses the first available direct-parent image in graph edge order.

Image bytes are not included in `GraphExecutionSnapshot` and are never passed to the snapshot persistence hook. PR #23 will add durable execution history/recovery metadata; durable image assets are outside this PR and belong to P10 Asset Library.

## Adapters

- `demoGraphAdapter` validates the runtime without making provider requests.
- `createGeminiGraphAdapter` delegates to the existing same-origin Backend Gateway image adapter. Provider credentials remain server-side; no API key or admin token is added to browser requests.

## Compatibility boundary

- Existing `PiecsWorkflow.steps` and `executeEngineJob` are unchanged.
- No automatic IndexedDB migration or workflow schema rewrite is performed.
- The graph runtime is an explicit API; wiring the graph editor and execution controls into the UI can be layered on after the scheduler contract is reviewed.

## Verification

The unit suite covers sequential dependencies, parallel branches, join input availability, concurrency limits, fail-fast behavior, cancellation, and the exclusion of image bytes from persisted snapshots.
