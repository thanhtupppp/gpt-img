# P11 PR #28 — Bridge API Foundation

## Scope

Establish the first versioned, authenticated HTTP boundary for external PIECS integrations.

## Endpoint

- `GET /api/v1/bridge/capabilities`
- Requires `Authorization: Bearer <PIECS_BRIDGE_TOKEN>`.
- Returns the Bridge API version and an explicit capability matrix.
- Returns no provider credentials, admin token, asset bytes, or internal configuration.

## Authentication

- Uses a dedicated `PIECS_BRIDGE_TOKEN` environment setting.
- Bridge authentication is independent from the existing `PIECS_ADMIN_TOKEN`.
- Missing bridge configuration returns HTTP 503.
- Missing or invalid credentials return HTTP 401.
- Tokens are compared using constant-time comparison.

## Capability contract

This foundation advertises capability discovery only. Prompt Package import/export, workflow submission, execution status, and webhooks remain explicitly unavailable until their respective PRs are implemented.

## Out of scope

- Prompt Package schema and import/export.
- Workflow submission and execution retrieval.
- Webhooks/events.
- Tenant-scoped credentials and RBAC.

## Validation

CI must pass TypeScript/unit/browser/build checks and the Python Gateway test suite before merge.
