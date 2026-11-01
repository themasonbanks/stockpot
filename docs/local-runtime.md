# Local Stockpot runtime

Use Bun 1.3.14 and an already installed, running Docker engine. When Bun is not on
PATH, prefix commands with `npx --yes bun@1.3.14`, for example
`npx --yes bun@1.3.14 run local:preview`. Install dependencies once with
`bun install --frozen-lockfile`.

| Command | Behaviour |
| --- | --- |
| `bun run local:setup` | Start/check Supabase, apply forward local migrations and prepare public mobile settings |
| `bun run local:preview` | Setup, then Expo at http://localhost:8081 |
| `bun run local:api` | Setup, then Hono at http://localhost:3000 |
| `bun run local:status` | Read-only Docker, Supabase and configuration checks |

Setup recognises Docker on PATH and standard macOS system/user Applications
installations. It does not install software or request administrator credentials.
The first Supabase launch may download images. Runtime command output is captured
so Supabase's privileged local keys do not appear in helper logs.

Mobile settings go into ignored `apps/mobile/.env.local`, containing only the
loopback Supabase URL and public anonymous key. Existing unrelated settings are
preserved. Conflicting public settings in the process environment or development
environment files are rejected, including duplicate overrides. Public values must
be literals; resolve environment substitutions before using these helpers. Preview
forces development mode so the checked files are the files Expo loads. Server-role
keys are never copied to mobile configuration.

An occupied preview/API port causes a clear error; the helper does not kill or
claim another process. Ctrl+C or SIGTERM stops the process it launched, including
its subprocess group on macOS/Linux. The local Supabase stack stays running, and
accounts, kitchens and stock remain intact. Windows process-tree behaviour has
not been verified. If needed, stop Supabase yourself without deleting its data;
do not use database reset against a kitchen you want to keep.

The API helper injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into its child process;
it writes no server credential file. `GET /health` returns liveness independently
of the database. `GET /ready` returns ready only when valid server configuration
can reach Auth and PostgREST; otherwise it returns HTTP503 with a generic body.
Readiness uses public credentials and a two-second deadline. No user records,
upstream error bodies or credentials appear in these responses. Bindings default
to loopback. `API_HOST=0.0.0.0` is an explicit container deployment choice, not the
default local configuration.

These are local development tools, not a production deployment system. See the
[v1 architecture decision](adr/001-v1-service-and-runtime-boundaries.md) for the
remaining application and operational work.
