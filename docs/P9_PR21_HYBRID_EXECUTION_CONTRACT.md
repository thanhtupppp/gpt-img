# P9 PR #21 — Hybrid Workflow Execution Contract

## Decision

P9 uses a hybrid directed-acyclic-graph (DAG) execution model. A workflow can combine sequential dependencies, parallel branches, and join points. A linear workflow is represented by a simple chain and remains valid.

## Graph model

- A node is one existing PIECS `WorkflowStep` identified by its stable `id`.
- An edge `from -> to` means the destination cannot start until the source node has completed successfully.
- Nodes with no unresolved incoming dependencies form one execution wave and may run concurrently.
- A join node becomes ready only after every incoming dependency has completed successfully.
- Cycles, self-references, duplicate node IDs, duplicate edges, and edges to missing nodes are invalid.
- Execution order within a parallel wave is deterministic and follows node declaration order.

## PR #21 scope

- Add a provider-neutral graph contract and deterministic topological planner.
- Add a Gemini image-step transport adapter that calls only the same-origin Backend Gateway.
- Preserve the existing sequential `PiecsWorkflow` schema and local Demo Adapter. The graph contract is additive and does not silently migrate existing saved workflows.
- Add unit tests for graph validation/planning and Gemini request/response handling.

## Security and data handling

- The browser never receives or stores the Gemini API key or Gateway admin token.
- The adapter sends requests only to `/api/v1/providers/gemini/images`.
- Image data is passed transiently between execution steps and is not persisted by this adapter.
- Production still requires the trusted reverse proxy/session boundary documented in `P8_IMAGE_STUDIO.md` to authenticate the app session and inject the Gateway admin token server-side.
- Do not persist base64 image data in IndexedDB job records, logs, URLs, or analytics.

## Follow-up boundaries

- PR #22 integrates the graph planner with a cancellable execution scheduler, transient image handoff, parallel branch policy, and join semantics.
- PR #23 adds durable execution history and recovery metadata without storing image bytes in job history.
- Asset persistence and reusable asset management remain P10 scope.
