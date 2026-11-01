# Mobile authentication and onboarding

Run `bun install --frozen-lockfile`, then `bun run dev:mobile`. Bun 1.3.14 is pinned;
`npx --yes bun@1.3.14` can run the same commands when Bun is not on PATH.
The web preview is `bun run --cwd apps/mobile web --port 8081`.

Supply `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the mobile
process environment, or put them in `apps/mobile/.env` (ignored by Git). Use the
public/anonymous key only. Never put a service-role key in an Expo public variable.
A missing configuration renders a retryable connection screen instead of crashing.
The backend and browser CI use separate server-only environment variables.

## Authentication

Email/password signup, verification, sign-in, resend, password reset and sign-out
use Supabase Auth with PKCE. Email links must be opened on the device that started
the request. Native callbacks are `stockpot://auth/callback` and
`stockpot://auth/recovery`; local browser callbacks use the same paths on
`http://localhost:8081` or `http://127.0.0.1:8081`. Add those exact URLs to hosted
Supabase Auth's redirect allowlist before device acceptance testing. The local
Supabase configuration already contains them. No hosted settings are changed by CI.

A native development build with the Stockpot scheme is needed to validate custom
links; Expo Go does not establish custom-scheme acceptance. This Mac has no Xcode
simulator, so native Keychain/Keystore, background refresh and link delivery remain
required device checks. The browser preview tests the React flows, not native storage.

Native sessions use Expo SecureStore. Large values are split into small encrypted
chunks and published by switching an encrypted manifest last. Operations serialize;
interrupted writes preserve the last complete value, and incomplete reads fail closed.
A crash can leave unreachable encrypted chunks for later cleanup. Web preview uses
sessionStorage, scoped to the tab. Recovery and failed sign-out intent are persisted
separately so a restart cannot reopen protected screens in either state. Account-owned
UI is keyed by user ID. Auth event callbacks are synchronous and never re-enter the SDK.

The current SDK removes a PKCE verifier after a failed exchange. An unsuccessful link
therefore offers a fresh-email path rather than promising that the same code can be
retried. Native links retain the SDK's validated `sb_flow_id`, so resending/resetting
does not silently select a different flow's verifier. Successful browser callbacks
remove one-use parameters from the URL before refresh.

## Household and invitations

Household creation persists a user-scoped UUID request ID before submission. The RPC
creates the owner atomically, and retries return the existing household. Private
profiles and preferences remain separate from shared kitchen settings.

Invitations contain a 96-bit random code and no household ID or privileged key. Only
its SHA-256 hash is persisted on the server; the code is returned once to the owner.
Codes expire after 24 hours. A replacement revokes older unused invitations. The
owner can share/select-copy a code or revoke it. Metadata can be restored, but raw
codes cannot; generate a replacement if the original response was lost.

Links use `stockpot://invite?code=…`, with manual code entry as fallback. Pending
invitations survive sign-in in secure native storage (sessionStorage in web preview).
Joining requires explicit confirmation. Acceptance locks profile → household → invite,
is atomic, enforces two-person capacity and safely retries for the same active member.
Expired, revoked, reused-by-another-person and archived-household cases fail safely.

## Validation

`bun run test`, `bun run lint`, `bun run typecheck`, and the mobile `export:web` script
cover portable logic, package contracts and bundling. `bun run db:test` requires a
disposable local Supabase stack. Database types must be generated with `bun run db:types`.

GitHub CI starts disposable Supabase, runs migrations/policy tests, compares generated
types, seeds disposable Auth accounts, and runs Playwright onboarding. Browser tests
include committed-but-lost responses, account switching, pending invitations and
concurrent acceptance/revocation/archive requests. The E2E harness refuses a hosted
Supabase URL. Service keys never enter the mobile bundle; CI uses them only to prepare
and inspect its disposable test data. Screenshots and reports are retained for seven
days; auth traces are disabled.
