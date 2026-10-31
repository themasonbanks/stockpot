# Working with the Stockpot agent team

The primary conversation is the project lead. Five reusable roles live in `.codex/agents/`; they are invoked for bounded tasks, not five continuously running jobs. Models and reasoning inherit the current session so this setup follows your existing choice.

## Roles and routing

- **stockpot-lead:** scope, dependencies, assignment, shared contracts, integration and completion evidence. Normally fulfilled by the primary agent. Spawn only for a bounded planning assessment; it must not launch a second team.
- **stockpot-product-design:** product decisions, interaction specifications, branding documentation and UX review. Invoke before new flows or when product requirements conflict.
- **stockpot-mobile:** Expo screens, navigation, sessions, deep links, accessibility and mobile tests.
- **stockpot-backend-domain:** schema/RLS, typed persistence, shared rules, planning and server integrations.
- **stockpot-reviewer:** independent correctness/security review, without editing. The author fixes findings.

Keep at most four agents active in total and at most two implementation agents writing. Project configuration allows three spawned agents alongside the primary. Specialists do not spawn children. Release a finished specialist before calling another if all slots are occupied.

## Assignment and handoff

The lead supplies:

1. Linear ticket or user objective and explicit acceptance criteria.
2. Relevant source documents and agreed interface contracts.
3. Base revision, worktree path, allowed files and owner of shared changes.
4. Dependencies, non-goals, validation requirements and expected output.

The specialist returns: outcome, changed files/commit, evidence for each criterion, commands/checks and results, unresolved risks, and integration instructions. Read-only assignments return findings rather than code.

Use separate worktrees for concurrent implementation. First establish a committed base containing all dependencies and the agent configuration. New worktrees do not copy uncommitted files. If the environment cannot isolate edits, run implementation serially; independent read-only review can still run alongside other work. Never run parallel migrations or resets against the same database instance.

A typical delivery cycle is: inspect ticket and dependencies → agree contracts/design → implement in owned files → validate → independent review → author fixes → integrate and verify → report delivery state. Only the lead coordinates authorized external updates. Configuration does not itself authorize messages, merging or deployment.

## Product sources

- [Stockpot project](https://linear.app/mason-banks/project/stockpot-0062bfe2f94c)
- [Product Principles & UX Decisions](https://linear.app/mason-banks/document/product-principles-and-ux-decisions-ed14e63548fd)
- [Technical Architecture](https://linear.app/mason-banks/document/technical-architecture-fa0ce6ae53ca)
- [Relational Data Model](https://linear.app/mason-banks/document/relational-data-model-e1d64d546411)
- [Ingredient & Inventory Model](https://linear.app/mason-banks/document/ingredient-and-inventory-model-9ddd2b89862b)
- [KEB-19: visual direction](https://linear.app/mason-banks/issue/KEB-19/stockpot-visual-design-direction)
- [KEB-20: agent branding guide](https://linear.app/mason-banks/issue/KEB-20/create-stockpot-agent-branding-guide)

Read current tickets rather than treating this guide as a live backlog. If Linear is unavailable, use the supplied context and repository evidence, identify the missing source, and avoid inventing requirements or status.

## Initial rollout

The setup review on 2026-09-27 found KEB-7 marked Done while its local changes remained uncommitted, and remote main still contained the scaffold. Recheck before starting work. Preserve and validate that foundation before building dependent worktrees.

Next establish CI checks and the KEB-20 branding guide. Then mobile authentication (KEB-8) and household schema (KEB-9) can proceed independently; household services (KEB-10) follow KEB-9. Household creation and subsequent onboarding depend on those results. Resolve photo-first versus manual stocktake scope before implementing KEB-18. These are follow-on assignments, not work performed by installing this team.

Add planning and AI/MCP specialist roles only when those workstreams have enough independent work to justify them.

## How to use

Open a new Codex task in this repository after creating or changing role files so agent discovery and project instructions can reload. Useful requests:

> Act as Stockpot lead. Inspect KEB-7 against the local changes and propose the smallest path to a validated, committed foundation. Preserve unrelated work.

> Use stockpot-product-design to prepare KEB-20 from the agreed Linear direction. Return a concrete guide and clearly identify decisions that still need my input.

> Implement KEB-8 with stockpot-mobile, then have stockpot-reviewer independently review the result. Keep changes within the ticket scope.

> Coordinate KEB-8 and KEB-9 in separate worktrees from the validated foundation. Agree shared interfaces first, then review and integrate the results.

The root AGENTS.md requests bounded delegation when useful. If the active tool interface cannot select a named role, the lead reads the corresponding TOML developer_instructions and supplies them explicitly to a generic subagent, preserving the role's constraints. This is a fallback, not proof of native role discovery. Do not silently drop role instructions or claim that a role was loaded when it was only read manually.

The reviewer requests a read-only sandbox; parent runtime overrides can affect sandbox inheritance, so its no-edit/no-external-write instructions also apply. File ownership and the two-writer limit are coordination rules, not filesystem access controls.

Configuration format: [official Codex custom-agent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents). Model selection, credentials and connector configuration remain in the user's existing setup; no credentials belong in these files.
