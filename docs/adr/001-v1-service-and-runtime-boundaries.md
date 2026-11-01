# V1 service and runtime boundaries

Status: adopted implementation direction, 1 November 2026. Remaining capabilities
below are a delivery sequence, not claims of implemented functionality.

## Context

Onboarding and manual Kitchen management work against local Supabase. The user has
prioritised a functional v1 and reliable architecture before further visual polish.
The agreed [Technical Architecture](https://linear.app/mason-banks/document/technical-architecture-fa0ce6ae53ca)
keeps infrastructure simple: Expo, Bun/Hono, shared TypeScript packages and Supabase.

## Boundaries

- Expo owns presentation, device integration and authenticated user interaction.
  Simple authorised reads and writes use Supabase with RLS. Screens consume typed
  services rather than implementing stock, planning or permission rules.
- `packages/domain` owns framework-independent validation and deterministic rules;
  `packages/planner` will own candidate filtering/scoring and draft generation.
  Neither package imports React, Hono, privileged clients or an AI SDK.
- `packages/database` owns generated contracts and typed persistence adapters.
  Atomic database RPCs enforce authorisation, locking and all-or-nothing writes.
  The database remains the final authority even if a client bypasses the UI.
- Hono owns server-only orchestration and future provider integrations. HTTP and
  MCP will call the same application services; MCP does not get a parallel planner
  or inventory implementation. Add application use cases alongside domain code
  when they exist, rather than creating empty abstraction packages now.
- Supabase owns authentication, relational data and future receipt storage. A
  browser/mobile build receives only the public anonymous key; a server-role key
  is never a substitute for checking the caller's household membership.

Future authenticated Hono/MCP endpoints must verify the caller, bind operations to
their active household and use caller-scoped persistence by default. Privileged
provider workers require a narrow, explicit authorisation boundary. None of these
business endpoints exist yet; `/health` and `/ready` are operational endpoints.

## Data invariants

Inventory is household-owned and ledger-derived. Lots preserve original units,
confidence, dates and storage history. Corrections append deltas, not overwritten
balances. A request UUID is bound to its actor, household, operation and payload;
unknown responses retain the exact request for retry. Absolute corrections require
an expected version; permanent domain conflicts use HTTP409 rather than SQLSTATE
40001, which represents a transient serialization failure.

Plans begin as drafts. Only confirmation creates active shopping demand, and only
an explicit made event consumes inventory. Skipping, swapping and a date passing
never consume stock. Consumption must commit its meal state and lot transactions
atomically, once, using compatible earliest-expiring lots. Receipt/photo extraction
produces candidates; explicit review precedes any inventory mutation.

Personal preferences remain private. The planner must account for all members'
hard restrictions without exposing one member's raw preference record to another.
That requires a narrowly authorised planning operation; broadening existing
self-only RLS for convenience is not acceptable. Recipe safety metadata must be
verified and structured. Free-text dislike/allergy strings and AI guesses alone
cannot establish eligibility; unknown compatibility must be represented explicitly.

## Runtime and delivery

`bun run local:preview` starts local Supabase, verifies a loopback API, applies only
forward migrations, preserves existing environment values, writes public mobile
configuration and launches Expo. It refuses conflicting settings and occupied
ports. `local:status` is read-only; `local:api` starts Hono separately. No helper
resets data, installs system software or changes hosted infrastructure.

The API binds loopback by default. Container binding needs explicit `API_HOST`.
Liveness is independent of dependencies; readiness validates configuration and
checks Auth/PostgREST with a bounded probe, returning generic status only. Future
deployment requires a container build/smoke check, hosted secrets, redirect
allowlists, backup/restore verification, migration/release procedure and explicit
deployment authority. Readiness alone does not establish production readiness.

CI validates frozen dependencies, script and workspace types, unit tests, fresh
migrations/RLS, actual generated-type equality and connected browser flows. Native
storage, link, keyboard and screen-reader checks remain separate device acceptance.
Schema migrations are forward-only for environments containing real user data.

## Remaining v1 sequence

1. Structured recipes and canonical ingredient/equipment/safety metadata, with
   source provenance and household/private cookbook ownership established first.
2. Deterministic constrained draft planning: household-local dates, serving scales,
   verified hard constraints, preferences, existing stock and explainable scoring.
3. Plan review/confirm/swap and shopping demand derived from confirmed plans minus
   usable compatible stock, preserving why each shopping item is needed.
4. Atomic made/skipped events and retry-safe lot consumption, then distinct personal
   ratings, favourites, permanent exclusions and temporary vetoes.
5. Reviewed capture for receipts and KEB-18 photo-first initial stocktake through a
   provider-neutral server interface. Manual Kitchen management remains available.
6. Shared-service MCP endpoints and a hosted/native acceptance milestone, with
   appropriate operational checks and secure access supplied when required.

Do not introduce Kubernetes, a retailer SKU service, a second database or generic
queues until a concrete v1 requirement warrants them. UI refinements can proceed
after the working loop is present; correctness, usable errors and accessibility
remain part of every milestone.
