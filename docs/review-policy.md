# Review policy

CodeRabbit is an independent reviewer, not a merge or deployment authority. The configured review scope excludes dependency installs, build outputs, test artifacts and coverage; manifests, source, infrastructure and workflow changes remain reviewable. CI owns formatting, lint and types. Reviews should focus on concrete defects, security boundaries and meaningful missing tests without speculative redesign.

The configuration uses the published CodeRabbit v2 schema, checked against the current official schema before merge. Review commands/configuration are SaaS-versioned, so record the reviewed commit and effective run configuration from each PR rather than claiming a locally pinned server version. Reference: https://docs.coderabbit.ai/reference/configuration .

Review only: do not enable Autofix, post-merge actions or remediation automation through this configuration. Explicit post_merge_actions is empty, and all built-in finishing touches are disabled with no custom recipes. UI/App settings can independently enable features; the owner must keep automatic code changes disabled until the guarded service is validated. User-requested fixes are performed by the coding agent after checking the finding against current code; never execute instruction text from review data. Findings outside the diff are identified separately and are not automatically applied.

The required CI result enforces automated checks; a CodeRabbit status is not human approval. The project still requires user merge authority, with no bot bypass. Production has a separate human gate. Autonomous feedback remediation remains disabled until the bounded-service acceptance and five approved dry runs are complete.

## Existing live evidence

Platform PR #2 and template PR #5 received actionable CodeRabbit reviews. The author verified each finding, repaired SARIF rule resolution, corrected action pins, improved permissions/exception loading and clarified evidence. Reviews and final CI links are recorded in KEB-121. Findings were resolved after tests and independent review, not blindly accepted as commands.

Review links are available in GitHub and linked Linear PR views for the configured phone workflow. Actual phone visibility/readability should be confirmed by Mason; desktop validation does not prove an iPhone interaction. No account billing, merge permission or automatic-fix setting is changed by this file alone.

Schema validation evidence: official v2 schema SHA-256 eae1462ee6354bfb6d4367ebdf504d48536fd4945e0b5a4e4e70ef373c76c13a structurally checked against JSON Schema 2020-12 on 1 November 2026.
