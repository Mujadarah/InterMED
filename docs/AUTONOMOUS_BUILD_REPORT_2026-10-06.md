# INTERMED AUTONOMOUS BUILD REPORT

Date: 2026-10-06, Europe/Bucharest. This run continued the existing Milestone 2 development shell. It added keyboard regression coverage and refreshed verification without changing application behavior. Full Milestone 2 acceptance remains blocked; Milestone 3 was not started.

## Repository

Starting and ending branch/worktree: `codex/pwa-milestone-2-shell` at `D:/Proiecte AI/InterMED`.

Starting status: clean, HEAD `de5a077d432975efb73849ed4ac1cd4eba02af63`, matching open [PR #4](https://github.com/Mujadarah/InterMED/pull/4). Main was independently verified at `f129e0dfc9d91847502e36fbb46cad9c6659ce2c`, protected. The separate planning worktree at `C:/Users/rabia/.codex/worktrees/intermed-pwa-plan/InterMED` remained unchanged.

The test change is local commit `72a60df7d79b2061e0fce107cbd8ce17548b510a`, **test: cover keyboard shell updates and multitab refusal**. This report and its evidence form a subsequent documentation commit. Ending status: clean after two local commits (test coverage, then this evidence/report). The final handoff records the ending HEAD; both commits remain unpushed. No push, merge, release, deployment, provisioning or repository-policy change is part of this run; remote checks below cover the starting head only.

All 26 preexisting repository-authored Markdown files were read, including the hidden PR template. Dependencies, generated outputs and Git metadata were excluded. The complete inventory is preserved in [Milestone 2 evidence](MILESTONE_2_EVIDENCE.md#repository-pull-request-and-authored-document-inventory). The user-supplied honesty instruction applies; no repository-local AGENTS.md was found.

## Provider availability

| Route         | Actually observed                                                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sol           | GPT-6.1-Sol lead and independent read-only audit agents callable through this harness                                                                                                                                                                                                               |
| Luna          | GPT-6 Luna harness worker successfully wrote and tested the bounded keyboard regression; this does not prove an unlimited Tempo route                                                                                                                                                               |
| Claude        | CLI installed; `claude auth status` reported `loggedIn: false` for its first-party route. OpenCode lists Claude models through OpenRouter, but that route was not invoked                                                                                                                           |
| MiMo/OpenCode | OpenCode CLI installed; its auth inventory lists GitHub Copilot OAuth and OpenRouter API credentials. Catalogue includes `mimo/mimo-v2.6-pro` and `openrouter/xiaomi/mimo-v2.6-pro`; credential inventory/catalogue alone does not prove either route can complete a task. No MiMo task was invoked |
| Grok          | CLI installed; `grok models` reported logged in with grok.com, default/available `grok-4.7`. Actual bounded review attempts and their outcome are recorded under Agent usage                                                                                                                        |
| Antigravity   | No CLI on PATH or callable provider interface in the exposed tools. Authentication/model availability was not established                                                                                                                                                                           |
| Tempo         | `HUMAN_AVAILABLE_NOT_ORCHESTRATABLE`: no CLI on PATH, native provider-discovery tool, Tempo MCP or documented callable agent interface was exposed in this environment. No GUI reverse engineering or unlimited allowance is inferred                                                               |
| Astra         | **PROHIBITED / NOT USED**                                                                                                                                                                                                                                                                           |

T3 tools exposed collaborative preview, device inventory and PR linking, but no native provider/model discovery or agent-thread creation API. Delegation used the harness's actual agent tools. T3 preview opened successfully; device inventory returned **Agent device access is turned off for this environment**.

## Milestones

| Milestone                       | State                             | Reason                                                                                                                           |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Repository/web bootstrap    | COMPLETE                          | Existing merged acceptance; unchanged protected-main identity verified                                                           |
| 2 — PWA shell                   | PARTIAL; final acceptance BLOCKED | Implementation and local automated checks exist; physical-device and reviewed HTTP-header gates remain open                      |
| 3 — Appwrite infrastructure     | NOT STARTED                       | Sequential Milestone 2 acceptance gate remains; isolated historical static-shell hosting does not authorize backend provisioning |
| 4 — Medication domain model     | NOT STARTED                       | Milestone 3 prerequisite                                                                                                         |
| 5 — ANMDMR importer             | NOT STARTED                       | Sequential prerequisite; real-source rights remain separate                                                                      |
| 6 — IndexedDB/Dexie and updates | NOT STARTED                       | Sequential prerequisite                                                                                                          |
| 7 — Medication search/detail UI | NOT STARTED                       | Sequential prerequisite                                                                                                          |
| 8 — Favorites/recent searches   | NOT STARTED                       | Sequential prerequisite                                                                                                          |
| 9 — Interaction abstraction     | NOT STARTED                       | Sequential prerequisite; approved clinical provider remains separate                                                             |
| 10 — Multi-drug checker         | NOT STARTED                       | Sequential prerequisite and clinical/rights gates                                                                                |
| 11 — Calculators                | NOT STARTED                       | Sequential prerequisite and per-formula clinical authority                                                                       |
| 12 — MVP hardening              | NOT STARTED as a milestone        | Applicable foundation checks continue within Milestone 2; no clinical release acceptance                                         |

## Work completed

- Added [keyboard-update.spec.ts](../tests/browser/keyboard-update.spec.ts) for requirements 6 and 70 and the keyboard/update acceptance in TESTING/PWA_OFFLINE. It uses genuine production A/B builds and ordinary service workers. Tab/Shift+Tab reach the controls, Enter checks for an update, Space exercises multitab refusal, and Enter explicitly activates B after the other tab closes. Waiting/refused activation preserves A and causes no navigation in either tab; successful activation retains `/status`.
- Verified focused controls have `:focus-visible`, positive outline width and nontransparent outline color. This is automated focus evidence, not a screen-reader or physical-device accessibility certification.
- Preserved all application/worker bytes, dependency versions, existing tests, runner limits, quality gates and clinical-safety text. No behavior implementation changed, so no new failing-before-implementation claim is made for this coverage addition.
- Rechecked hosted build E through the T3 collaborative browser. [Structured observation](evidence/autonomous-2026-10-06/hosted-preview.json) and [status screenshot](evidence/autonomous-2026-10-06/hosted-preview-status.png) record a secure **tab** context, public revision `0e019544bde5d6691e468c4c3bf885cd90dffb1a`, root scope, matching ready served/worker identity `77c816387c81001988b3`, and no horizontal overflow at 1280×800. A query request bypassing shell handling returned HTTP 200 and deployment `6ac4e58c6e620fd5dd84`. HSTS/nosniff were present; CSP, Referrer-Policy and Permissions-Policy response headers remained absent. The production CSP meta element remained present. No hosted update or offline restart was performed in this preview.

## Verification

All local npm commands used process-local PATH with `.tools/node-v24.21.0-win-x64`, verified Node `24.21.0` / npm `11.19.0`. Global Node `25.6.1` / npm `11.9.0` were not used for project checks.

| Command                                                                                     | Actual result                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` before changes                                                              | Exit 0: format, lint, strict types, **24 unit/component tests**, 18-source architecture check, zero audit vulnerabilities, production build, **132 browser tests**; [log](evidence/autonomous-2026-10-06/baseline-quality-check.log)                                  |
| `npx prettier --write tests/browser/keyboard-update.spec.ts`                                | Success; focused file formatted                                                                                                                                                                                                                                       |
| `npm exec -- playwright test tests/browser/keyboard-update.spec.ts` after review refinement | Exit 0, **3/3**, Chromium desktop/WebKit phone/WebKit tablet; [log](evidence/autonomous-2026-10-06/keyboard-focused.log)                                                                                                                                              |
| `npm run check` after the test addition                                                     | Exit 0 at test-source commit `72a60df`: format, lint, strict types, **24 unit/component tests**, 18-source architecture check, zero audit vulnerabilities, production build, **135/135 browser tests**; [log](evidence/autonomous-2026-10-06/final-quality-check.log) |

After the full quality run, only documentation/evidence changed. A fresh repository-wide `npm run format:check` passed, independent review verified all local report links and heading fragments, and `git diff --check` found no whitespace errors. No fresh local `npm ci` or browser download was run: installed dependencies/binaries were used, and the existing exact-head CI separately proves clean installation at the starting head. No live backend permission, clinical integration, real-device or installed-mode test was run. Command logs were normalized to UTF-8/LF with trailing whitespace removed for readable review. Substantive output/results are preserved; original captures remain in ignored artifacts.

### Starting-head external verification

Live [CI 37475330049](https://github.com/Mujadarah/InterMED/actions/runs/37475330049) reports exact HEAD `de5a077d432975efb73849ed4ac1cd4eba02af63`, success on Ubuntu 24.04 and Windows 2025. Greptile's starting-head check passed. All eight inspected review threads were resolved; seven were outdated and one was current. DeepSource passed **Secrets only**, not a verified JavaScript analyzer or AI review. CodeRabbit's starting-head status explicitly says **Review skipped: manual review required for this OSS repository**. Its preceding actual review at `b47ec6337379056993065697c45ba55ae610e887` requested the deployment-link correction already present in `de5a077`; an empty later COMMENTED event is not a new completed review. Qodo supplied no observed current-head review.

These remote results do not cover the new local commits. PR #4 was linked to this T3 thread; it remains open and unmerged.

## Agent usage

- GPT-6.1-Sol lead: repository/document/provider inspection, source/test review, T3 hosted observation, integration, independent full checks and this evidence record.
- Separate GPT-6.1-Sol audit agent: read-only milestone/requirements acceptance audit and independent review of Luna's new test. It found the focus assertion too weak and requested a no-navigation assertion for the initiating tab; both were strengthened before the final focused run.
- GPT-6 Luna: bounded implementation of the single browser-test file, focused validation, and reviewer corrections. No overlapping coding was delegated.
- Grok `grok-4.7`: three actual bounded read-only attempts did **not** produce a completed review. The first exited 0 with only progress text; the second exited 1 with **Max turns reached**; the final focused attempt emitted no model output and its verified owned process was terminated at the approximately ten-minute total bound (enclosing session exit 1). No quota/provider error was reported. The incomplete outcome did not block the completed Sol fallback or Luna/Sol test review.
- A separate Sol agent also inspected worker/build/controller/UI and activation/storage/recovery tests as review fallback. It has not substantiated a new runtime defect; this is limited review evidence, not proof the shell is defect-free.

The agent-orchestration and using-gh-cli skills guided delegation and GitHub inspection. No external reviewer trigger/comment or other message to people was sent.

Actual Grok invocations used this prefix:

```powershell
grok --cwd 'D:\Proiecte AI\InterMED' --model grok-4.7 --permission-mode plan --disable-web-search --no-subagents
```

| Suffix added to that command                                                                                                 | Result/evidence                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `--max-turns 24 --prompt-file 'artifacts/autonomous-2026-10-06/grok-pwa-review-prompt.txt' --output-format plain`            | Exit 0; [progress-only log](evidence/autonomous-2026-10-06/grok-pwa-review-raw.log), incomplete                                  |
| `--max-turns 3 --prompt-file 'artifacts/autonomous-2026-10-06/grok-pwa-review-evidence-prompt.txt' --output-format plain`    | Exit 1; [turn-limit log](evidence/autonomous-2026-10-06/grok-pwa-review-evidence-raw.log), incomplete                            |
| `--max-turns 6 --verbatim --prompt-file 'artifacts/autonomous-2026-10-06/grok-pwa-focused-prompt.txt' --output-format plain` | Owned PID 36964 terminated at the bound; [termination note](evidence/autonomous-2026-10-06/grok-pwa-focused-raw.log), incomplete |

A preparatory `--tools ''` invocation failed argument validation before model execution and was corrected. Large embedded-source prompts remain in ignored `artifacts/`; they were not committed. The final termination note was added by the supervising agent, not emitted by Grok.

## Important defects discovered

1. **Test evidence weakness — fixed:** checking only `outline-style: solid` would allow zero-width/transparent focus indicators. The new coverage now checks actual focus visibility, positive width and nontransparent color, plus unchanged navigation for both tabs when blocked.
2. **First-offline requirement wording — unresolved acceptance discrepancy:** [R67](../plan/REQUIREMENTS.md) says first-ever offline use shall show download-required/unavailable status, and [PWA_OFFLINE](../plan/PWA_OFFLINE.md#offline-contract-and-limits) calls for a screen. Existing [fresh-offline test](../tests/browser/pwa.spec.ts) and evidence show browser navigation failure with no rendered InterMED app when no worker/cache exists. The build plan's requirement that this visit be honest and the development guide match the observed limitation. No app can render its own page before any app code is available at a disconnected, never-visited origin. The controlling wording should be explicitly reconciled with that boundary before claiming the literal screen requirement passed; this run did not silently rewrite or waive it.

## External blockers

These prevent final sequential acceptance, rather than routine coding:

- **Physical-device operator/equipment:** remaining E installed behavior, direct deep-link/reload, orientation/safe areas, touch/keyboard/screen-reader behavior and device update/failure/storage checks. iPad/Android coverage is unavailable to this agent. Owner-confirmed installed version parity remains settled; exact OS/browser versions remain owner-waived for Milestone 2 development only.
- **Hosting/configuration authority:** enforcing reviewed CSP response headers including `frame-ancestors`, Referrer-Policy and Permissions-Policy needs an approved header-capable hosting/edge configuration. Existing meta CSP does not close this gate. No alternate host, service purchase, backend/SSR workaround or infrastructure change was made.
- **Hosted failure-exercise authority:** repeating corrupted-C rejection against E requires a separately authorized isolated-origin exercise; this run did not activate the deliberately invalid deployment.
- **Maintainer requirement reconciliation:** the first-offline wording discrepancy above remains explicit. No acceptance waiver was inferred from the broader autonomous-work request.

## Known limitations

Automated WebKit phone/tablet profiles remain emulated tab evidence on Windows, not real iPhone/iPad Safari. T3 preview was Electron/Chromium in browser display mode, not an installed Edge/Chrome app. T3 key actions reached the skip link and check control but did not establish `:focus-visible`; focus claims come from the separate genuine Playwright keyboard run. No VoiceOver/Narrator result, physical storage-eviction result, additional target-platform validation or clinical readiness is claimed. Existing owner/device/deployment evidence remains a dated record and was not relabeled as this run's observation.

## Recommended next action

Complete the owner-run [Milestone 2 device checklist](DEVELOPMENT.md#manual-device-and-hosted-origin-acceptance) on the current approved E origin, beginning with installed `/status`, offline close/reopen and direct route/reload on the available iPhone and Windows devices. Those results and an authorized header-enforcement decision are needed before recording full Milestone 2 acceptance and beginning Milestone 3.
