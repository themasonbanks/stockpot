# Onboarding data (KEB-13/15/16)

Personal preference profiles belong to the authenticated user. Dietary rules retain
separate `allergy`, `dietary` and `dislike` types; cuisine scores are -1, 0 or 1.
Independent planner weights are normalized to [0,1], defaulting to 0.5. Cooking time
is an integer from 5–240 minutes, defaulting to 30. Explicit safety review is persisted
separately from full completion, allowing restart at the first incomplete substep.
Full completion requires safety review.

Shared planning settings belong to households: weekly/fortnightly cadence, Sunday=0
through Saturday=6 planning day, equipment catalogue keys and an optional 500-character
note. Timezone and servings are read from and atomically updated on `households`, never
duplicated in the settings table. A planning date means the household-local calendar
date, not a UTC midnight or fixed 24-hour interval; daylight-saving boundaries must use
the household timezone. Default servings are 1 or 2.

Only authenticated callers can invoke aggregate RPCs. Private values are caller-bound;
shared reads/writes require current active membership. Direct client mutation grants
are absent. Personal saves lock the caller's profile; shared saves lock the household,
serializing with membership and archival operations. All replacement payload validation
precedes deletes. Lists canonicalize whitespace/case and reject duplicate values.

Completion is monotonic in the initial workflow: a valid stale draft cannot reset a
previously completed personal/shared profile. A deliberate future reset needs an explicit
operation. An existing completed personal profile cannot save unreviewed safety data.

The four RPCs return the agreed camel-case JSON contracts. Missing saved profiles return
null, not fabricated completion. Raw normalized tables remain RLS-protected; trusted
service-role access is explicit. The SQL tests cover personal isolation, hard/soft rule
separation, normalized values, atomic failure, member sharing, stale drafts and archival.
Generated types and SQL execution are performed by the lead's disposable Supabase CI.
