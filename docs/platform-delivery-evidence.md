# Platform delivery evidence

The repository already contains a PR acceptance/validation/rollback template, delivery criteria and ADR template. The working agreement now explicitly adds issue-first work, one issue per branch, generic secret handling, ambiguity reporting, user-only merge/deploy authority and the code-comment convention.

## Existing Stockpot task

[Stockpot PR #2](https://github.com/themasonbanks/stockpot/pull/2) links KEB-7 and states its concrete outcome, automated validation and remaining native checks. It was merged on 31 October 2026. Its [CI run 41223886074](https://github.com/themasonbanks/stockpot/actions/runs/41223886074) passed code quality and disposable Supabase validation. Its description retains historical pre-merge wording; GitHub's merged state is the authoritative integration evidence.

## Review from a phone

Use short Outcome, Acceptance evidence, Validation and Rollback sections in each PR. State exactly which tests ran, link their results, and keep implemented, reviewed, merged and deployed states distinct. Use images only for relevant visible changes. GitHub/Linear review links work with the already configured phone workflow; actual readability on Mason's iPhone remains a user check, not something desktop CI proves.

No application behaviour, schema, runtime dependency or deployment is changed by this documentation task.
