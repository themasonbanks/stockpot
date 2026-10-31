# Delivery criteria

A Stockpot change is ready for review when its Linear acceptance criteria are implemented,
relevant automated tests pass, lint and all workspace type checks pass, and an independent
review has no unresolved blocking findings. Record any unavailable checks explicitly.

Schema changes need migrations tested on disposable local Supabase, row-level security
coverage for both permitted and denied access, and committed generated types matching
the migrated schema. CI runs these checks without hosted credentials. Never point the
CI database workflow at a shared or production database.

Mobile changes need light/dark, accessibility, and relevant native simulator/device
checks. Browser previews do not establish secure-storage or deep-link behaviour.

Use the PR template to connect implementation to issue criteria and document rollback.
Separate implemented, tested, reviewed, merged, and deployed states. Do not mark a
Linear issue Done while required evidence or integration remains outstanding.

The CI workflow provides Code quality and Database policies and types checks. Making
these mandatory for merging requires repository branch-protection configuration;
adding a workflow alone does not enforce that policy.
