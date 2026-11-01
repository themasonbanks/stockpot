# Kitchen inventory

Canonical ingredients are shared, read-only authenticated catalogue entries. The initial
catalogue contains 32 common foods and aliases, retaining basmati/brown rice as distinct
identities. Each ingredient has one measurement dimension. Additions accept g/kg,
ml/l or decimal count, normalize deterministically to grams, millilitres or count and
retain the original amount/unit on the lot. Values use at most three decimal places,
with a maximum of one billion base units. Piece-to-weight estimates and mass/volume
density conversions are deliberately deferred: a mass ingredient requires its weight.

Households own lots and ledger transactions. There is no mutable balance column:
remaining stock is the sum of immutable transaction deltas for that lot. A new lot
and its initial positive transaction commit atomically. Absolute corrections include
the lot's expected version and record the difference as a new transaction, including
a reason and the authenticated actor. Zero is valid; an empty lot and its history
remain available. Neither planning nor time passing deducts anything.

Each mutation includes a client-generated UUID request ID. The caller must retain
that ID and exact payload before sending, and retry the same request after an
uncertain response. Private request records bind household, actor, operation and
full JSON payload and retain the committed response. Replays return that response,
not a new mutation; payload or actor changes conflict. A replay can contain an older
lot version, so refresh the list after success. Corrections with a stale version
conflict rather than overwriting another member's work.

Mutation RPCs perform a real parent household row update before checking active
membership. This serializes writes with membership/archive lifecycle changes;
REPEATABLE READ contenders fail instead of authorizing against an old parent
snapshot. Every mutation then locks its lot. Household-scoped reads enforce active
membership. Clients have SELECT with RLS but no INSERT/UPDATE/DELETE privileges;
only caller-bound security-definer RPCs can write. Actor identity comes from
auth.uid(), never payload. The ledger's update/delete trigger also prevents trusted
normal paths from rewriting history. Privileged schema administrators remain trusted.

Expiry dates are calendar dates with per-lot provenance. `use_by` and `best_before`
mean a user-confirmed packaging date; `estimated` means user-estimated freshness,
never a confirmed safety date. An absent date remains absent. Freezing is explicit,
records its timestamp and a zero-delta history event, and preserves the original
date and provenance. It creates no freezer shelf-life estimate or safety guarantee.
Lots added already frozen record this state at addition. Use-soon considers positive
nonfreezer lots dated within three calendar days, including passed dates, using the
household-local date. Frozen original dates remain visible in details but do not
create immediate refrigerated-expiry warnings. No food is automatically spoiled or
removed. Corrections do not edit dates; no estimate can extend a confirmed date.

Typed operations are `createInventoryService`: searchIngredients, listLots, addLot,
adjustLot, freezeLot and getHistory. Domain validation/formatting/filtering is in
`packages/domain/src/inventory.ts`. SQL enforces the same trusted boundary, numeric
limits and dimension invariants. The database types are generated from the migrated
local schema; do not hand-edit them.

This milestone provides ongoing manual Kitchen management. KEB-18's resumable,
photo-first reviewed onboarding stocktake remains separate. Receipt extraction,
recipe consumption, FEFO allocation, assumed-staple preferences and automatic
freezer guidance are future features; this model provides their ledger foundation.
