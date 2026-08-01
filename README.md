# Stockpot

**Make more of what you’ve got.**

Stockpot is a kitchen inventory and meal-planning product for individuals and two-person households. Its goal is to provide meal-kit convenience using the food already in your kitchen: understand what is on hand, plan varied dinners that intelligently reuse ingredients, and make the remaining shopping and stock administration as effortless as possible.

This repository is the foundation for the mobile product, backend API, shared TypeScript modules, and Supabase infrastructure. Stockpot will also expose its capabilities through MCP so that people and agents can work with the same inventory and planning system.

## Product loop

Stockpot is built around a continuous loop:

1. Kitchen stock
2. Expiry awareness
3. Meal plan
4. Shopping list
5. Receipt scan
6. Updated stock
7. Cooking and consumption
8. Updated stock

Receipt scanning and cooking events should keep inventory current without turning Stockpot into another daily chore.

## Product principles

- **Automate the admin, surface the decisions.** Stockpot should handle routine capture and reconciliation while asking people only for choices that need judgment.
- **Treat expiry as first-class data.** The product should eventually track individual inventory lots, distinguish confirmed use-by and best-before dates from estimates, and prioritise food that needs using soon.
- **Prefer passive accuracy.** Receipts, cooking activity, and sensible estimates should update stock wherever possible instead of requiring manual daily checks.
- **Plan for real households.** Recommendations should suit individuals and two-person households, reuse ingredients efficiently, and still produce varied dinners.
- **Keep people in control.** Automation should be understandable, correctable, and explicit about uncertainty.

## Architecture

Stockpot is a Bun-managed TypeScript monorepo orchestrated by Turborepo.

- `apps/mobile` contains the Expo and React Native client.
- `services/api` contains the Hono API running on Bun. It is the future boundary for mobile and MCP-facing capabilities.
- `packages/domain` is reserved for framework-independent domain types and rules.
- `packages/database` is reserved for database access and persistence adapters.
- `packages/planner` is reserved for meal-planning capabilities.
- `packages/shared` is reserved for genuinely cross-cutting TypeScript utilities and contracts.
- `supabase` contains local Supabase configuration, migrations, and Edge Functions.

Workspace dependencies use Bun's `workspace:*` protocol. Package exports point to TypeScript source so apps and services can import shared code directly during development without copied builds or duplicate implementations.

## Repository structure

```text
stockpot/
├── apps/
│   └── mobile/
├── packages/
│   ├── domain/
│   ├── database/
│   ├── planner/
│   └── shared/
├── services/
│   └── api/
└── supabase/
    ├── migrations/
    └── functions/
```

## Technology stack

- [Bun](https://bun.sh/) for package management, runtime, scripts, and tests
- [Turborepo](https://turbo.build/repo) for monorepo task orchestration
- TypeScript in strict mode
- [Expo](https://expo.dev/) and React Native for mobile
- [Hono](https://hono.dev/) for the backend API
- [Supabase](https://supabase.com/) for local services, Postgres, authentication, storage, migrations, and Edge Functions
- [Biome](https://biomejs.dev/) for linting and formatting

## Local development

### Prerequisites

- Bun 1.2 or later
- A simulator or Expo Go-compatible device for mobile development
- Docker and the Supabase CLI when running the local Supabase stack

### Setup

```sh
git clone https://github.com/themasonbanks/stockpot.git
cd stockpot
bun install
cp .env.example .env
```

Start all development tasks:

```sh
bun run dev
```

Or start a single workspace:

```sh
bun run dev:mobile
bun run dev:api
```

The API listens on `http://localhost:3000`; `GET /health` returns its health status. Expo prints the available device and simulator options when the mobile task starts.

To run Supabase locally after installing its CLI:

```sh
supabase start
supabase stop
```

## Root commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Run development tasks across the monorepo |
| `bun run dev:mobile` | Start the Expo development server |
| `bun run dev:api` | Start the Hono API with watch mode |
| `bun run test` | Run workspace tests |
| `bun run lint` | Check source files with Biome |
| `bun run format` | Format source files with Biome |
| `bun run format:check` | Verify formatting without changing files |
| `bun run typecheck` | Type-check every workspace |

## MVP status

Stockpot is at the repository-scaffolding stage. The monorepo, minimal Expo client, Hono health endpoint, shared package boundaries, and local Supabase layout are present. Inventory lots, expiry modelling, meal planning, shopping lists, receipt scanning, consumption flows, persistence, authentication, and MCP exposure are intentionally not implemented in this scaffold and will arrive in later tickets.
