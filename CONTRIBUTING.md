# Contributing to InterMED

Issues, feature proposals, documentation corrections, accessibility/privacy reviews and focused pull requests are welcome. Never submit real or identifiable patient data or credentials.

## Current stage and workflow

This is a planning-first repository. The canonical direction is React/TypeScript/Vite PWA, IndexedDB/Dexie and Appwrite infrastructure, not a native-iOS-first app. Native application development is cancelled; do not reintroduce native SDKs/build pipelines. No live Appwrite credentials or proprietary clinical dataset is required for documentation work.

1. Read every repository Markdown file. Start with [plan/README.md](plan/README.md); requirements, architecture and clinical safety are controlling.
2. Propose focused changes from a fork/topic branch through a pull request; do not push directly to main or bypass review/status-check policy.
3. For future behavior changes, add and run a failing test before implementation, then record passing verification. Use synthetic fixtures/mock providers.
4. Keep domain/clinical logic independent of React, browser persistence and Appwrite/provider SDKs.
5. Run the relevant documented checks and complete the PR template. Tooling/build commands will be introduced in milestone 1; do not report nonexistent tests as passing.

For documentation changes, review all changed files, local Markdown links, requirement traceability and cross-file scope consistency. Do not scaffold the application during the current documentation revision.

## Repository access and automated reviews

The public repository accepts bug reports, feature proposals and fork-based PRs from any GitHub user. Public visibility does not grant write access. As verified on 2026-10-01, Mujadarah is the only human collaborator; main requires a PR even for administrators, resolved conversations and linear history, with force-push and deletion disabled. Topic branches remain writable by authorized maintainers so they can prepare PRs. Existing installed apps retain their own granted permissions; this is not a claim that bots are read-only.

Review scope is independent of main's protection. `.coderabbit.yaml` matches every target branch with `.*`; `greptile.json` has no branch/author/label/keyword restrictions; `.pr_agent.toml` leaves Qodo source/target branch exclusions empty. Automatic review and update triggers are enabled, including draft feedback where supported. These files request reviews, not automatic approval or merge.

CodeRabbit and Greptile can use PR-branch configuration. Qodo loads `.pr_agent.toml` from the default branch, so its new policy takes effect after this configuration is merged. App installation alone does not prove a completed review: check actual bot comments/checks on the latest PR head, including PRs targeting non-default branches. Account eligibility, quota and service availability can still prevent a review.

DeepSource Code Review and secrets detection were verified enabled in its dashboard, which describes automatic review of every PR; no main-only filter was configured. Currently no language analyzers are enabled because application scaffolding has not been implemented. DeepSource's default branch is a baseline for results, not a restriction to main-targeted PRs. Its AI review availability is a separate account/plan constraint; do not treat a secrets scan as an AI review.

References: [CodeRabbit configuration](https://docs.coderabbit.ai/reference/configuration), [Greptile configuration](https://www.greptile.com/docs/code-review/greptile-json-reference), [Qodo configuration file](https://docs.qodo.ai/qodo-documentation/code-review/get-started/configuration-overview/configuration-file), [Qodo exclusion controls](https://docs.qodo.ai/qodo-documentation/code-review/concepts), [DeepSource repository settings](https://docs.deepsource.com/docs/platform/dashboard/repository/settings).

## Clinical sources and security

Clinical thresholds, formulas, medication doses, interactions and treatment recommendations need a permitted authoritative source, version/provenance, tests and clinical review. Public regulatory data are not automatically redistributable. Do not copy Mediately content or commit proprietary provider responses.

[CLINICAL_SAFETY.md](plan/CLINICAL_SAFETY.md) is mandatory. OCR/AI-derived clinical facts remain candidates until clinician confirmation. Missing interaction records are not proof of safety; LLM output is not dose/interaction authority.

Use original synthetic fixtures; no patient/query content in logs/analytics. Frontend configuration is public: never commit server keys/provider tokens. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

First-party contributions are Apache-2.0. Third-party data/assets need their own permission/attribution and cannot be relicensed merely by adding them here.
