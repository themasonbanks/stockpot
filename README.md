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
- `packages/domain` contains framework-independent household, onboarding and inventory rules.
- `packages/database` contains generated Supabase contracts and typed household, invitation, preference and inventory services.
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

- Bun 1.3.14 (pinned in `package.json`)
- A simulator or Expo Go-compatible device for mobile development
- Docker and the Supabase CLI when running the local Supabase stack

### Setup

```sh
git clone https://github.com/themasonbanks/stockpot.git
cd stockpot
bun install
cp .env.example .env
```

Fill in the public Supabase values for Expo. Backend processes additionally use
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the service-role key must never be
placed in an `EXPO_PUBLIC_*` variable or bundled into the mobile app.

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

Apply forward migrations while preserving existing local kitchens, then run the database policy tests:

```sh
supabase migration up --local
bun run db:test
```

After changing the schema, refresh the shared TypeScript definitions while the
local stack is running and commit the result:

```sh
bun run db:types
```

Type generation replaces the committed file only after successful, non-empty output.
A stopped local Supabase stack leaves the previous types intact. Signup display
names are trimmed and capped at 80 characters; blank names remain unset.

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
| `bun run test:e2e` | Exercise onboarding and Kitchen against disposable local Supabase |

## MVP status

Stockpot now has connected email/password authentication, secure native session storage,
household creation and invitations, private food preferences, shared planning/equipment,
and resumable onboarding. The light/dark mobile UI uses the documented semantic design
system. See [mobile setup and validation](docs/mobile-onboarding.md).

The Kitchen now supports a starter ingredient catalogue, manual additions, storage views,
per-lot confirmed or estimated dates, quantity corrections, explicit freezing and immutable
stock history. Interrupted saves retain their request across restarts and safely retry.
See [inventory rules and boundaries](docs/inventory-data.md).

Photo-first onboarding stocktake, recipe library, meal planning, shopping, receipt scanning,
cooking/consumption and MCP remain future work. The app does not fabricate stock or dinners.
Native device acceptance still requires reachable Supabase and a Stockpot development build.

## Continuous integration

Pull requests and pushes to `main` run `.github/workflows/ci.yml`. Code checks use the
Bun version in `package.json`, frozen dependencies, lint, all workspace type checks and
uncached tests. A separate Ubuntu job starts disposable local Supabase, applies
migrations, runs the SQL/RLS tests and compares regenerated, formatted database types
with the committed file. No hosted Supabase credentials are needed.

See [delivery criteria](docs/definition-of-done.md) and the
[architecture decision template](docs/adr/template.md). Branch protection must be
configured separately to require these checks before merging.
