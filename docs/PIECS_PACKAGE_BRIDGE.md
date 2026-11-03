# PIECS Package & Bridge Contract (P6)

**Status:** Draft contract for review. This document defines an interoperable package format and an optional integration boundary. It does not implement network transport, authentication, provider calls, image generation, or workflow execution.

## 1. Product boundaries

PIECS has three independently deployable parts:

1. **Prompt Studio (core):** local-first libraries, command builder, workflow builder, JSON Studio, and manual import/export. It works without an account, backend, API key, or AI provider.
2. **AI Workflow Engine (optional):** a separate execution product responsible for provider credentials, image generation/editing, queues, retries, execution history, and generated assets.
3. **PIECS Bridge (optional):** a versioned contract and adapter boundary for exchanging packages and, in a later compatible release, execution requests/results. Bridge is not an execution engine.

External Mode remains the default. Integrated Mode is opt-in. Neither Engine nor Bridge is required for Prompt Studio to work.

## 2. Package format v1

Canonical media type: `application/vnd.piecs.package+json`

Canonical discriminator: `kind = "piecs.package"`

The package envelope contains:

- `kind`: stable discriminator.
- `schemaVersion`: package contract version, independent of the app release.
- `packageId`: UUID identifying this exported package instance.
- `exportedAt`: ISO-8601 date-time with an explicit timezone.
- `source`: producer name and version; informational, never trusted for authorization.
- `content`: portable templates and workflows.

Templates and workflows preserve their own entity `version` and `schemaVersion`. Package schema versioning must not silently redefine entity schemas. Command references are identifiers; receivers resolve them against their own compatible command catalog and must report unresolved references rather than inventing commands.

The v1 package intentionally excludes:

- API keys, provider credentials, access tokens, cookies, and secrets.
- Generated image bytes, local filesystem paths, browser storage keys, and IndexedDB internals.
- User identity, device identifiers, private account data, and execution history.
- Provider-specific executable code or arbitrary remote URLs intended for automatic fetching.

All v1 objects reject undeclared properties. v1 does not define an extension-metadata bag; future extensions must be explicitly versioned rather than silently carried through imports. Scalar parameter maps also reject prototype-sensitive keys (`__proto__`, `prototype`, and `constructor`). Values remain inert data and must never be evaluated or executed.

## 3. Validation and import behavior

Treat every imported package as untrusted `unknown` input. Validate the envelope, size limits, supported schema version, entity records, duplicate IDs, and command references before writing anything.

Import is atomic: either all accepted entities are committed, or none are. Never overwrite an existing local entity silently. The UI must show a conflict/unresolved-reference report and require an explicit user decision before any replace/merge behavior is added.

A receiver must reject:

- An unknown `kind` or unsupported major contract version.
- Malformed JSON, invalid entity records, duplicate IDs within the package, or package size above the configured limit.
- Prototype-sensitive keys or unsafe values during both JSON Schema validation and runtime import validation.
- Unsupported entity schema versions and undeclared properties.

A receiver may accept a newer minor version only when the contract explicitly guarantees backward-compatible additive fields; otherwise reject with a structured compatibility error. v1 implementations should require exact `schemaVersion = "1.0.0"`.

## 4. Bridge boundary

Bridge adapters translate between the package contract and a target Engine's own API. Prompt Studio must not import provider SDKs or store provider credentials.

The Bridge API should expose capability discovery and package transfer first:

- `GET /bridge/v1/capabilities`: reports supported package schema versions and supported operations.
- `POST /bridge/v1/packages`: submits a PIECS package for validation/import.
- `GET /bridge/v1/packages/{packageId}`: retrieves a previously accepted package when the adapter supports retrieval.

Transport authentication, authorization, CORS, rate limiting, retention, and audit logging belong to the Bridge/Engine deployment, not the portable package. Do not expose a Bridge endpoint on an untrusted network without authentication.

Execution submission/status/result operations are reserved for a later contract revision. They are not part of this P6 implementation and must not be represented as working UI/API functionality yet.

## 5. Compatibility and error model

Bridge responses should use stable machine-readable codes and human-readable messages. Minimum codes:

- `INVALID_PACKAGE`
- `UNSUPPORTED_SCHEMA_VERSION`
- `PACKAGE_TOO_LARGE`
- `DUPLICATE_ENTITY_ID`
- `UNRESOLVED_COMMAND_REFERENCE`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Errors must not echo credentials or sensitive payload values. Include a request/correlation ID where transport exists.

## 6. Example package

```json
{
  "kind": "piecs.package",
  "schemaVersion": "1.0.0",
  "packageId": "7e7f9a20-5d1d-4f75-9e24-7d0b5b2d2c01",
  "exportedAt": "2026-11-03T00:00:00.000Z",
  "source": {
    "name": "PIECS Prompt Studio",
    "version": "0.1.0"
  },
  "content": {
    "templates": [],
    "workflows": []
  }
}
```

## 7. P6 acceptance criteria

- The contract and JSON Schema agree on required fields, types, strict property handling, and discriminator.
- Automated tests compile the Draft 2020-12 schema and cover valid packages plus malformed envelopes, unsupported versions, invalid entities, and unsafe map keys.
- The format is provider-neutral and contains no credentials or generated binary assets.
- Package schema version is distinct from entity schema versions.
- Import guidance requires validation, conflict reporting, and atomic writes.
- Bridge responsibilities are isolated from Prompt Studio and Engine internals.
- No network integration or AI execution is added to Prompt Studio in P6.
