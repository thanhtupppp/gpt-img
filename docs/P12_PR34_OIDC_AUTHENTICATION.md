# P12 PR #34 — OIDC Authentication & Principal Identity

## Scope

This PR introduces a provider-neutral OIDC JWT validation boundary without changing the existing service-to-service authentication used by Provider Admin or Bridge APIs.

## Backend configuration

- `PIECS_OIDC_ISSUER`: exact issuer URL from the identity provider.
- `PIECS_OIDC_AUDIENCE`: expected API audience.
- `PIECS_OIDC_JWKS_URL`: trusted JWKS endpoint.
- `PIECS_OIDC_ALGORITHMS`: comma-separated asymmetric algorithms; RS256 is the default. Only RS256, RS384, ES256, and ES384 are accepted.

When OIDC is not configured, `GET /api/v1/auth/me` returns 503. It never accepts unsigned tokens or falls back to the shared admin/bridge token.

## API and validation

- `GET /api/v1/auth/me`: validates a bearer JWT and returns subject, issuer, audiences, and scopes.
- `require_user`: reusable FastAPI dependency returning an immutable Principal.
- Validates signature, exact issuer, audience, expiry, and required `sub`, `iss`, and `aud` claims.
- Applies 30 seconds of clock-skew tolerance.
- Restricts algorithms to an explicit asymmetric allowlist; `none` and shared-secret algorithms are rejected.
- Uses PyJWT JWKS caching and `kid` key selection for normal signing-key rotation.
- Authentication failures do not echo tokens or raw JWT claims.

## Compatibility and rollout

- Existing `PIECS_ADMIN_TOKEN` Provider Admin routes remain service-token protected.
- Existing `PIECS_BRIDGE_TOKEN` Bridge routes remain service-token protected.
- No frontend environment variables or browser storage are added.
- OIDC configuration is optional during this foundation PR; user-facing routes can adopt `require_user` incrementally.
- Tenant identity, workspace membership, roles, authorization policies, credential partitioning, quotas, and billing are deferred to later P12 PRs.
