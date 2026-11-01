# Household data boundary (KEB-9)

The MVP permits one active household per user and at most two active members per
household. Active households require at least one owner. Both owner and member may
read household data and edit shared name, timezone and default servings (1–2).
Timezone must be a Postgres-recognised timezone. Personal profiles remain private.

Membership slots (1 or 2), partial unique indexes and deferred lifecycle constraints
enforce these rules in Postgres. Membership mutations write the parent row to
serialize concurrent lifecycle changes; callers must retry serialization failures
or deadlocks with the same request ID. The owner invariant is checked at transaction
end, allowing atomic household creation and archival. Consumers must leave these
constraints deferred during multi-row lifecycle operations.

Clients cannot insert/delete households or insert/update/delete memberships directly.
`create_household` atomically creates the household and caller's owner membership.
Supply a UUID request ID and reuse it for retries; a retry for the same active household
returns the existing row without overwriting settings. An existing different active
membership is rejected. IDs are supplied by the client but ownership always comes
from `auth.uid()`, never from client arguments. A collision with another household ID
fails, without returning its data.

`is_household_member(household_id)` is a caller-scoped RLS predicate for later shared
tables. It recognises both roles, requires active membership and household, and has no
arbitrary user argument. Definer functions use an empty search path and explicit grants.

`archive_household` requires an active owner, atomically archives members then the
household, and allows the same archived owner to retry. Archived records are immutable
and hidden from the client. Hard deletion is rejected. Auth/profile deletion is
restricted by retained references; a future account-deletion workflow must handle
that explicitly rather than silently discard history. Invitation acceptance and
individual member-management operations remain KEB-12; no public membership bypass
is introduced for them.

Run `bun run db:test` against disposable local Supabase. CI runs migrations, pgTAP
policy/lifecycle tests and generated-type drift checks. Types are generated from the
migrated database, not authored by hand. Multi-session stress testing and native/UI
flows are separate validation from the SQL assertions.
