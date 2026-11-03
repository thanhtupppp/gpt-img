# P11 PR #29 — Prompt Package Import/Export

## Package contract

- Format identifier: `piecs-prompt-package`.
- Package version: `1.0.0`.
- Domain schema version remains `1.0.0`.
- Contains custom templates and sequential workflows, plus export timestamp.
- Unknown fields are discarded by explicit field whitelisting; credentials and arbitrary metadata are not part of the package contract.
- System templates are excluded from export and imported templates become user-owned custom templates.

## Safety and validation

- JSON input is limited to 5 MiB.
- Rejects invalid JSON, unknown format/version, malformed entities, empty packages, and duplicate IDs.
- Uses existing domain validators for templates and workflows.
- Import checks existing IDs and writes both entity types in one IndexedDB transaction; collisions reject the entire import.
- No API keys, Gateway tokens, provider credentials, image blobs, execution history, or asset data are exported.

## API

- `createPromptPackage` / `serializePromptPackage`
- `parsePromptPackage`
- `exportPromptPackage`
- `importPromptPackage`

## Scope boundaries

This PR provides the package contract and storage APIs. It does not add file-picker or download controls to the UI, nor does it migrate legacy workflows.
