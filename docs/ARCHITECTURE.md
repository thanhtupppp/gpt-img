# PIECS Library Architecture (P1)

## Product boundary

PIECS Library is a local-first, provider-neutral command and workflow library. P1 establishes the application foundation and domain contracts; it does not add authentication, remote APIs, cloud sync, or AI image execution.

## Domain model

- `PiecsTemplate`: reusable template metadata, command references, parameter values, origin, entity version, and schema version.
- `PiecsCommand`: reusable command definition, module, syntax, parameter definitions, and examples.
- `PiecsWorkflow`: ordered command steps with per-step parameters.
- `PiecsProfile`: reusable defaults and rules.
- `ParameterDefinition`: typed input contract for command parameters.

The current schema version is `1.0.0`. Changes that alter persisted data must introduce an explicit migration before release.

## Validation contract

All imported or persisted external data must be treated as `unknown` until validated. Validation returns structured issues with a field path and human-readable message. Invalid data must not be written to storage.

## Styling contract

Tailwind CSS remains the utility layer. Shared brand, semantic, typography, spacing, radius, and shadow values are exposed as CSS custom properties in `src/styles/tokens.css`. Feature code should consume tokens rather than introduce unrelated hard-coded design values.

## Testing contract

- Unit tests cover domain validation and pure business logic.
- Component tests cover interactive UI behavior.
- E2E tests cover user journeys after the relevant feature is implemented.
- Pull requests must pass typecheck, test, and production build.

## Current P1 implementation notes

The existing MVP data and UI remain in place during the foundation stage to reduce regression risk. Legacy `Template` records are not yet migrated to `PiecsTemplate`; that conversion belongs in the template repository/seed work in P2.
