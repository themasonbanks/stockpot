# Stockpot agent team

## Working agreement

- Start from the current Linear issue and acceptance criteria; use one issue per branch and keep unrelated changes out of the PR. Report unclear requirements or missing source evidence before choosing a new direction.
- Never put credentials, tokens or private values in commits, screenshots, logs or review examples. Report secret references, not secret values.
- The task does not grant merge or deployment permission. Obtain explicit user authority for either; production requires its separate human gate.
- Code comments explain what the code beneath them does. Put ticket references, decision rationale and implementation history in documentation or PR descriptions.

- The main conversation acts as project lead. Use the five roles in `.codex/agents/` and the workflow in `docs/agent-team.md`.
- Delegate bounded, independent work when useful. Keep at most four agents active including the lead, at most two implementation agents writing, and no nested delegation by specialists.
- Give each assignment a ticket or user objective, acceptance criteria, base revision/worktree, allowed files, dependencies, checks, and expected handoff. Keep small or sequential work local.
- Use separate worktrees for concurrent implementation. Worktrees do not include uncommitted changes: reconcile required work into an agreed committed base before dispatch. If isolation is unavailable, serialize writes.
- Preserve existing changes. Never reset, stash, commit, or include another task's changes without establishing ownership. One owner at a time for migrations, shared contracts, package manifests, and `bun.lock`.
- The lead coordinates integration and Linear updates within the user's authorized scope. Specialists return results to the lead; do not independently send comments, change ticket status, merge, or deploy.
- Request independent review of substantive implementation. Return findings to the author, then verify the integrated result. Distinguish implemented, tested, reviewed, merged, and deployed; a ticket is not Done merely because files exist locally.

## Sources and architecture

- Read the relevant Linear ticket and linked project documents before product work. Project: https://linear.app/mason-banks/project/stockpot-0062bfe2f94c. Use `docs/agent-team.md` for document links. Surface material conflicts rather than silently choosing a new product direction.
- `apps/mobile`: Expo/React Native UI, navigation and device integration. `packages/domain`: framework-independent rules. `packages/database`: persistence and generated types. `packages/planner`: planning. `services/api`: Hono, server-only integrations and MCP. `packages/shared`: genuinely cross-cutting contracts only.
- Keep business rules out of screens and thin transport adapters. Simple client operations may use Supabase with RLS; meaningful multi-step operations use shared application services. HTTP and MCP reuse those services.
- Never expose service-role keys in the mobile bundle or `EXPO_PUBLIC_*` variables. Enforce household ownership and personal-data boundaries in database policies as well as application logic.

## Product invariants

- Automate the admin, surface the decisions. Shared operational state belongs to households; preferences and feedback belong to individuals.
- Inventory changes use an auditable ledger; lots retain expiry, storage and provenance. Canonical ingredient identity is separate from units; use grams, millilitres and count as base units.
- Only meals marked made consume inventory. Planning, skipping and swapping do not deduct stock. Make state-changing operations safe to retry and prevent double consumption.
- Receipt extraction creates candidates; confirmation is required before stock changes. Plans begin as drafts; confirmed plans drive active shopping demand.
- Distinguish confirmed use-by/best-before dates from estimates. Never extend confirmed use-by dates with estimates. Freezing is explicit and preserves original history.
- Hard dietary restrictions are constraints, not scoring preferences. AI may extract, suggest and explain; deterministic logic owns permissions, quantities and state.
- Preserve distinct feedback intent (favourite, rating, permanent exclusion and not tonight). Prefer earliest-expiring compatible lots and retain transaction provenance.
- Follow the agreed visual direction and approved design tokens. If `docs/brand/stockpot-brand-guide.md` is absent, have product/design resolve the required rules before proliferating new screen styles; do not treat proposed tokens as approved.

## Validation and handoff

- Use Bun and existing package scripts. Run relevant tests plus `bun run lint` and `bun run typecheck` for code changes. Run `bun run test` for integrated changes; report cached results honestly.
- For schema/RLS changes, run `bun run db:test` against a disposable local Supabase instance and regenerate database types with `bun run db:types`. Never reset a database without verifying it is disposable and within scope.
- Exercise native mobile behaviour on a simulator/device where available. Browser previews alone do not validate secure storage, native navigation or deep links.
- Test meaningful failure cases and domain invariants, not implementation details. Explain checks that could not run and their impact.
- Handoff: outcome, changed files/commit, acceptance-criteria evidence, checks and results, unresolved findings, and integration dependencies. Keep evidence concise and reproducible.
