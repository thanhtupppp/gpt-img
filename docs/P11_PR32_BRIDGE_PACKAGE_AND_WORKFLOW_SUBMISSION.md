# P11 PR #32 — Bridge Package Transfer and Workflow Submission

## Scope

This change extends the authenticated PIECS Bridge API with:
- Prompt Package import and retrieval using the existing `piecs-prompt-package` 1.0.0 envelope.
- Hybrid DAG workflow submission with server-side structural validation.
- Durable execution records and execution-status lookup.
- Optional `Idempotency-Key` support for safe submission retries.

All Bridge endpoints require the independent `PIECS_BRIDGE_TOKEN`. The Bridge token is not interchangeable with `PIECS_ADMIN_TOKEN`.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/bridge/capabilities` | Discover implemented Bridge capabilities |
| POST | `/api/v1/bridge/packages` | Import/store a Prompt Package |
| GET | `/api/v1/bridge/packages/{package_id}` | Retrieve/export a stored Prompt Package |
| POST | `/api/v1/bridge/workflows` | Validate and queue a hybrid workflow graph |
| GET | `/api/v1/bridge/executions/{execution_id}` | Retrieve execution status |

Package transfer accepts Prompt Package 1.0.0, up to 5 MiB. Workflow submission accepts graph schema 1.0.0, up to 200 nodes, 1,000 edges, and 1 MiB. Cycles, self-edges, duplicate IDs, unknown endpoints, unsupported fields, and sensitive credential/token field names are rejected.

## Execution semantics — important limitation

A successful workflow submission returns HTTP 202 and a durable execution record with status `queued`. Repeated requests with the same `Idempotency-Key` and graph ID return the same execution ID. Reusing the key for a different graph returns HTTP 409.

**This PR does not execute workflows.** The repository currently has a browser-side graph runtime, not a server-side worker connected to the Gateway. Therefore the Bridge reports `workflow_execution_worker: false`; it does not claim queued work is running or succeeded. A future worker integration must atomically claim queued records, execute with server-side provider adapters, persist terminal states, and handle cancellation/retries before that capability is enabled.

## Persistence and security

Bridge packages and execution queue records are stored in the configured SQLite database (`PIECS_DATABASE_PATH`, default `data/piecs-gateway.sqlite3`). Package and graph payloads are size-limited and reject known API-key, token, and credential field names. Do not place image bytes or provider credentials in package/workflow payloads. Asset binaries remain outside Prompt Packages.

## Configuration

Set `PIECS_BRIDGE_TOKEN` to a high-entropy secret. Keep it server-side. Do not expose it in `VITE_*` variables or browser bundles.

## Verification

Backend tests cover Bridge authentication isolation, package transfer round-trip, package schema and secret rejection, valid DAG queueing, cycle rejection, idempotent retries, idempotency conflicts, and execution-status retrieval.
