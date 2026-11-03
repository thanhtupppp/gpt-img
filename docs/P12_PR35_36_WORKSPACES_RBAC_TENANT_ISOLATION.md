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
- This change establishes workspace identity and authorization primitives. Resource-level tenant scoping must be applied to every resource repository before enabling multi-tenant production traffic.
- Do not expose admin or bridge service tokens to browsers.
- Configure production OIDC issuer, audience and JWKS URL only behind the trusted application session boundary.
- Existing shared Provider Vault and Bridge service-token routes remain privileged single-tenant compatibility surfaces and must not be exposed to untrusted multi-tenant clients.
