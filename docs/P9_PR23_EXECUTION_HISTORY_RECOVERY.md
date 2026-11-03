# P9 PR #23 — Execution History & Recovery

## Scope
- Persist DAG execution snapshots in a dedicated IndexedDB `graphExecutions` store.
- List, retrieve, and delete execution history.
- Reconcile stale `running` executions as `interrupted` after application restart.
- Preserve successful and pending node metadata; mark nodes that were running at shutdown as interrupted.
- Keep image payloads, provider credentials, and transient node outputs out of persisted history.

## Recovery safety
Recovery is metadata reconciliation, not automatic execution replay. A browser restart cannot establish whether an in-flight provider request completed remotely. Automatically replaying it could incur duplicate API charges or duplicate side effects. Explicit retry UX/policy can be designed separately with idempotency safeguards.

## Compatibility
- Existing `engineJobs` store and sequential workflow records are unchanged.
- IndexedDB schema advances from version 3 to 4 and creates the new store without deleting existing stores or records.
- Graph runtime snapshots remain metadata-only. P10 Asset Library owns durable image assets.

## Validation
Repository tests cover CRUD/sorting, stale-running reconciliation, preservation of completed records, and metadata-only persistence.
