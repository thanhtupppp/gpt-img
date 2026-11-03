# P12 PR #35+36 — Workspaces, Membership, RBAC & Tenant Isolation

## Identity
- Internal users are keyed by the validated OIDC `(issuer, subject)` pair.
- Email, display name, client-provided roles and unverified token claims are not identity keys.
- Workspace creation atomically creates its creator as the initial owner.

## Workspace roles
- `owner`: full workspace administration.
- `admin`: manage members except ownership and administer workspace resources.
- `member`: normal workspace operations.
- `viewer`: read-only membership and resource access.
- Roles are loaded from SQLite membership records on each authorization check.

## Membership
- Membership states are active or suspended.
- Members are addressed by exact OIDC issuer + subject; no email-based account linking.
- Ownership cannot be assigned through member role updates or removed through member deletion.
- Non-members receive a non-disclosing 404; insufficient roles receive 403.

## Persistence and migration
- Uses additive SQLite tables and foreign keys. Existing Gateway, Bridge and Vault tables are not destructively rewritten.
- No legacy records are silently assigned to a newly created workspace.
- Legacy service-token routes remain separate from user OIDC authentication.

## Security boundaries and rollout
- OIDC remains optional until configured; workspace endpoints fail closed through the existing OIDC dependency.
- Workspace-scoped OIDC routes are available under `/api/v1/workspaces/{workspace_id}` for Bridge package import/export, workflow submission/status/cancellation, and provider credential management. Membership and role are checked on each request.
- Bridge package and execution rows carry a nullable `workspace_id`; legacy rows remain `NULL` and are not visible through workspace-scoped routes. Worker claims preserve the workspace ID.
- Workflow assets use a workspace-specific object-key prefix. Workspace Gemini credentials are encrypted in a separate `(workspace_id, provider_id)` Vault table; worker adapter lookup is bound to the claimed execution workspace.
- Legacy shared Bridge and Provider Admin endpoints remain privileged compatibility surfaces, not tenant-aware APIs. They must remain behind a trusted server boundary and must not be exposed to untrusted multi-tenant clients.
- R2/S3 production configuration, OIDC provider setup, and trusted reverse-proxy/session deployment remain deployment tasks; this PR does not configure production secrets.
- Do not expose admin or bridge service tokens to browsers.
- Configure production OIDC issuer, audience and JWKS URL only behind the trusted application session boundary.
- Existing shared Provider Vault and Bridge service-token routes remain privileged single-tenant compatibility surfaces and must not be exposed to untrusted multi-tenant clients.
