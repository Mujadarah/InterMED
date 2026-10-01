# Contributing to InterMED

Issues, feature proposals, documentation corrections, accessibility/privacy reviews and focused pull requests are welcome. Never submit real or identifiable patient data or credentials.

## Current stage and workflow

Milestone 1 provides a nonclinical React/TypeScript/Vite web shell. IndexedDB/Dexie and Appwrite infrastructure remain later sequential work. Native application development is cancelled; do not reintroduce native SDKs/build pipelines. Contributors need no live Appwrite credentials or proprietary clinical dataset.

1. Read every repository Markdown file. Start with [plan/README.md](plan/README.md); requirements, architecture and clinical safety are controlling.
2. Propose focused changes from a fork/topic branch through a pull request; do not push directly to main or bypass review/status-check policy.
3. For behavior changes, add and run a failing test before implementation, then record passing verification. Use synthetic fixtures/mock providers; installation/configuration errors are not red behavior tests.
4. Keep domain/clinical logic independent of React, browser persistence and Appwrite/provider SDKs.
5. Follow [development setup](docs/DEVELOPMENT.md), run `npm run check` after the pinned install/browser download, and complete the PR template. Record actual results and device-validation limits.

For documentation changes, review all changed files, local Markdown links, requirement traceability and cross-file scope consistency. Implementation follows the build plan's milestone gates; the shell does not authorize later capabilities or deployment.

## Repository access and automated reviews

The public repository accepts bug reports, feature proposals and fork-based PRs from any GitHub user. Public visibility does not grant write access. Write access is restricted to authorized maintainers and installed apps with explicitly granted permissions. The main-branch policy requires a PR even for administrators, resolved conversations and linear history, and prohibits force-push and deletion. Topic branches remain writable by authorized maintainers so they can prepare PRs; app permissions must be assessed separately, not assumed read-only.

Review scope is independent of main's protection. `.coderabbit.yaml` matches every target branch with `.*`; `greptile.json` has no branch/author/label/keyword restrictions; `.pr_agent.toml` leaves Qodo source/target branch exclusions empty. Automatic review and update triggers are enabled, including draft feedback where supported. These files request reviews, not automatic approval or merge.

CodeRabbit and Greptile can use PR-branch configuration. Qodo loads `.pr_agent.toml` from the default branch, so its new policy takes effect after this configuration is merged. App installation alone does not prove a completed review: check actual bot comments/checks on the latest PR head, including PRs targeting non-default branches. Account eligibility, quota and service availability can still prevent a review.

Keep collaborator inventories, dashboard activation, eligibility and quota observations in a [dated audit record](plan/REVISION_AUDIT.md), not this policy. Recheck them when needed; repository configuration does not override service-level constraints, and a green skipped check does not prove review completion.

DeepSource review scope must cover every PR, without a main-only filter. Enable applicable language analyzers when application scaffolding exists. Its default branch is a results baseline, not the intended review-scope restriction. Verify actual check/review results and distinguish secrets detection, static analysis and AI review; a secrets scan is not an AI review.

References: [CodeRabbit configuration](https://docs.coderabbit.ai/reference/configuration), [Greptile configuration](https://www.greptile.com/docs/code-review/greptile-json-reference), [Qodo configuration file](https://docs.qodo.ai/qodo-documentation/code-review/get-started/configuration-overview/configuration-file), [Qodo exclusion controls](https://docs.qodo.ai/qodo-documentation/code-review/concepts), [DeepSource repository settings](https://docs.deepsource.com/docs/platform/dashboard/repository/settings).

## Clinical sources and security

Clinical thresholds, formulas, medication doses, interactions and treatment recommendations need a permitted authoritative source, version/provenance, tests and clinical review. Public regulatory data are not automatically redistributable. Do not copy Mediately content or commit proprietary provider responses.

[CLINICAL_SAFETY.md](plan/CLINICAL_SAFETY.md) is mandatory. OCR/AI-derived clinical facts remain candidates until clinician confirmation. Missing interaction records are not proof of safety; LLM output is not dose/interaction authority.

Use original synthetic fixtures; no patient/query content in logs/analytics. Frontend configuration is public: never commit server keys/provider tokens. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

First-party contributions are Apache-2.0. Third-party data/assets need their own permission/attribution and cannot be relicensed merely by adding them here.
