# Milestone 1 acceptance evidence

Date: 2026-10-01. Scope: repository/web bootstrap only. Baseline verified from GitHub: PR #2 merged to `main` as `6d7e2134426c82e9b46ef444dccf6fda15944ae6`. Local `main` was clean and fast-forwarded from `fdcb56f`; this branch was newly created as `codex/pwa-milestone-1-bootstrap`. The separate merged planning worktree was not reused or modified.

Requirements addressed at bootstrap level: 1–3, 6 (basic responsive/keyboard shell), 8 (Router/Zod foundations), 119, 122–123, 127 (pinned dependencies and audit), 135–141 and 145 (boundaries/injection). These are scoped foundations, not completion of all future behavior in those requirements. Safety and all clinical requirement text remain unchanged.

## Read-before-edit inventory

All **22 of 22** preexisting repository Markdown files were read in full, including hidden `.github/pull_request_template.md`, before scaffolding. Long output was split/re-read to cover truncated portions; summaries did not replace the full read. Git metadata and external dependency documents are not repository-authored Markdown.

- `.github/pull_request_template.md`
- `CONTRIBUTING.md`, `README.md`, `SECURITY.md`
- `plan/APPWRITE.md`, `plan/ARCHITECTURE.md`, `plan/CLINICAL_SAFETY.md`, `plan/CODEX_BUILD_PLAN.md`
- `plan/DATA_MODEL.md`, `plan/DATA_SOURCES.md`, `plan/FUTURE_CLOUD_AUTH.md`, `plan/INTERACTIONS.md`
- `plan/InterMED_SOURCES_AND_SDKS.md`, `plan/MEDICATION_DATA.md`, `plan/PRODUCT_SPEC.md`, `plan/PWA_OFFLINE.md`
- `plan/README.md`, `plan/REQUIREMENTS.md`, `plan/REQUIREMENTS_TRACEABILITY.md`, `plan/REVISION_AUDIT.md`, `plan/ROADMAP.md`, `plan/TESTING.md`

No repository-local AGENTS.md was found; the user-supplied honesty instruction governs. The previous documentation-only restriction concerned PR #2; the maintainer explicitly authorized this new Milestone 1 implementation.

## Test-first record

Local raw logs are kept in ignored `artifacts/`. Valid red assertions: configuration rejected neither invalid mode nor unknown public keys; injected provider label was ignored; domain/private-import fixtures were accepted; component shell lacked safety/navigation/recovery content; browser launch lacked the development notice. Initial suite: 15 failed / 3 passed (18 tests). Minimal implementations then passed 18/18. A subsequent startup-error test first failed because no accessible alert existed, then the composition root added the safe error path.

The initial preview command failed from nested npm argument forwarding. It was fixed before recording the browser assertion failure. Dependency installation and runner configuration failures are not described as red tests.

## Verification results

Local Windows x64 evidence, Node `24.21.0` / npm `11.19.0`:

| Executed command                         | Observed result                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `npm ci --no-fund`                       | Exit 0; 374 packages installed, zero vulnerabilities; root lockfile unchanged |
| `npx playwright install chromium webkit` | Exit 0; browser binaries installed from Playwright CDN                        |
| `npm run format:check`                   | Exit 0; every matched file formatted                                          |
| `npm run lint`                           | Exit 0; zero errors/warnings                                                  |
| `npm run typecheck`                      | Exit 0; strict root and DOM-free domain compilation                           |
| `npm run test`                           | Exit 0; 19 tests passed in five files                                         |
| `npm run check:boundaries`               | Exit 0; 12 actual source files inspected; domain manifest dependency-free     |
| `npm audit --audit-level=low`            | Exit 0; zero vulnerabilities at this snapshot                                 |
| `npm run build`                          | Exit 0; production HTML/CSS/JS generated                                      |
| `npm run test:browser`                   | Exit 0; 15/15 passed, no skips/retries                                        |
| `npm run check`                          | Exit 0; all gates above ran in sequence                                       |

The documented/CI browser installation command adds `--with-deps` for Linux OS libraries; the Windows local download used `npx playwright install chromium webkit`. CI will establish the documented command on both operating systems. Lockfile SHA-256: `bea5a2a978a90b9e19d237ce576cc784f542b1823affaed6fd21924b755e7c57`.

Browser versions queried from the installed engines: Chromium `153.0.8010.12`, WebKit `26.6`; Playwright `1.63.0`. Viewports: Chromium desktop 1280×720, WebKit phone 390×664 and tablet 810×1080 (device descriptors include touch/mobile emulation). Launch/no-external-request, route/deep-link reload, unknown-route recovery, keyboard skip navigation and viewport-fit checks ran on each project. Three synthetic shell screenshots were visually inspected and remain in ignored `test-results/`.

The first full browser run had 13 passes and two WebKit Tab-focus failures. Isolated plain-link/button/input probes showed ordinary links skipped but explicit `tabindex=0` links focused. Shell links now explicitly join the Tab sequence. The original keyboard assertions then passed in all projects; no tests were skipped and no changed input mode was retained. Production output: JavaScript 326.08 kB (101.92 kB gzip), CSS 2.15 kB (0.91 kB gzip), HTML 0.51 kB. This is measured bootstrap size, not a finalized clinical-release performance budget.

Scope/security consistency review found no clinical data, credentials, persistence, vendor SDKs or network calls in the app. LICENSE, SECURITY, all-branch reviewer configuration and the complete `plan/` corpus are unchanged. Existing issue/PR templates are preserved. Environment placeholders contain only mock mode. Dependency pins/API decisions are listed in [DEVELOPMENT.md](DEVELOPMENT.md); no required Context7 capability was unavailable.

Latest-head CI and reviewer observations will be recorded after PR creation. Local passing checks do not establish external review completion or clinical readiness. DeepSource TOML activation is limited by its default-branch prerequisite; no repository settings are changed to bypass it. ESLint 9's upstream maintenance warning is documented in the development guide.

## Remaining gates and Milestone 2 handoff

No manifest, icons, service worker, offline cache, installation help, Appwrite provisioning, persistence, medication model/importer/search/checker, calculators, account, patient/OCR/AI or native implementation is included. No paid service, repository protection setting, merge, tag or release is authorized here.

After Milestone 1 acceptance evidence and PR review, Milestone 2 may specify manifest/scope/icons, standalone metadata, scoped shell caching, first-offline fallback and safe user-controlled updates. Shell and future dataset releases must remain independent; no storage-clearing update mechanism. Real iPhone/iPad Safari remains unverified and must be explicitly tracked. Source rights, clinical provider/content approval and Appwrite provisioning remain separate later gates. Do not start Milestone 2 from this task.
