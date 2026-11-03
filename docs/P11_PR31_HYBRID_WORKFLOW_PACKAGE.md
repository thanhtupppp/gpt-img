# P11 PR #31 — Hybrid Workflow Package Transfer

## Scope
- Persist named hybrid DAG workflows in the separate IndexedDB `workflowGraphs` store.
- Upgrade the PIECS Library database from version 5 to 6 by adding the new store; existing stores and records are retained.
- Extend Prompt Package 1.0.0 with an optional `workflowGraphs` array. Its optional nature keeps previously exported 1.0.0 packages importable.
- Validate graph schema, node/edge structure, references, duplicates, and cycles before import.
- Import templates, sequential workflows, and DAG workflows in one IndexedDB transaction.
- Include only asset IDs referenced by DAG nodes; never include image Blob bytes.

## Asset reference policy
- A graph node may refer to an existing Asset Library item through `parameters.input_asset_id`.
- Import checks every referenced ID against the destination device's Asset Library inside the same read-write transaction.
- If any reference is missing, the entire import is aborted and the error lists missing IDs. Users must restore the assets separately before retrying.
- Asset binaries are deliberately not exported or transferred by Prompt Package.

## Compatibility and security
- Legacy sequential `workflows` retain their original shape and validation.
- Older Prompt Package 1.0.0 files without `workflowGraphs` remain valid.
- Hybrid graphs are stored separately from legacy sequential workflows.
- Package parsing whitelists graph metadata, nodes, edges and scalar parameters; unknown fields are discarded.
- Credentials, tokens, execution history and image bytes are excluded.
