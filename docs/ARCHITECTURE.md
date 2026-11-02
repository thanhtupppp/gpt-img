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

## Validation coverage\n\n- `validateTemplate` checks template metadata, profile, command references, scalar parameters, origin, and schema version.\n- `validateCommand` checks command metadata and parameter definitions, including enum options and numeric ranges.\n- `validateWorkflow` requires at least one ordered step and validates each step's scalar parameters.\n- `validateProfile` checks profile defaults and rules.\n- Type guards are provided for all four persisted entity types.\n- Validation functions accept `unknown`; callers must validate before persistence.\n\n## Styling contract

Tailwind CSS remains the utility layer. Shared brand, semantic, typography, spacing, radius, and shadow values are exposed as CSS custom properties in `src/styles/tokens.css`. Feature code should consume tokens rather than introduce unrelated hard-coded design values.

## Testing contract

- Unit tests cover domain validation and pure business logic.
- Component tests cover interactive UI behavior.
- E2E tests cover user journeys after the relevant feature is implemented.
- Pull requests must pass typecheck, test, and production build.

## UI composition and responsive shell

- `AppShell` owns the responsive sidebar, mobile overlay, navigation state, top bar, and main content landmark.
- Template cards, template detail, and stat cards are isolated reusable components under `src/components`.
- `App.tsx` composes page-level features and owns cross-page state; navigation remains lightweight client state rather than adding a routing dependency.
- Interactive controls expose accessible names, pressed/current states, visible focus styles, and mobile-friendly touch targets.
- Workflow Builder and custom-template creation remain intentionally non-functional placeholders and are labeled as planned work; they are not represented as completed features.

## Current P1 implementation notes

The existing MVP data and UI remain in place during the foundation stage to reduce regression risk. Legacy `Template` records are not yet migrated to `PiecsTemplate`; that conversion belongs in the template repository/seed work in P2. The remaining UI decomposition, shared components, route shell, and responsive behavior are tracked separately as P1 completion work.

## P2 local-first persistence

- Browser IndexedDB database `piecs-library` stores normalized PIECS templates and favorite IDs.
- `src/storage/templateRepository.ts` is the persistence boundary; callers validate data before writes.
- System templates are seeded idempotently and are immutable. Users create editable copies with `cloneTemplate`.
- Custom templates can be saved and deleted; deleting a custom template also removes its favorite marker.
- Favorites persist across reloads. Data remains on the current browser/device; clearing site data or changing browsers may remove or isolate it.
- `fake-indexeddb` provides a deterministic IndexedDB implementation for repository unit tests.
