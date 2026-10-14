# CI hardening report — 2026-10-14

Worktree: the requested `ci-hardening` worktree only. Branch: `claude/ci-hardening`. Baseline: `c4c48ee`. No push, PR, merge, deployment or live Appwrite operation was performed. The main checkout and other worktrees were not edited. Both pinned Node runtimes were read from the locations specified by the brief.

## Preflight and scope

All 69 repository-authored Markdown files were read before code edits, including hidden `.github` Markdown and the ignored handoff. Reading was divided between the coordinator and three read-only investigators. No controlling contradiction was found. See `markdown-inventory.log`. Historical milestone evidence is not current acceptance evidence.

Pinned environment: Node 24.21.0, npm 11.19.0; `INTERMED_NODE22_RUNTIME` points to official Node 22.23.2. `npm ci` ran once successfully in this worktree; its log reports zero vulnerabilities.

## 1. Importer handler artifact timeout

Observed failure: supplied Windows job 114998950195 exhausted the 60,000 ms test deadline (reported duration 60,213 ms). The test independently compiles/typechecks the package sources twice, derives two locks to prove determinism, seeds an isolated verified tarball cache, performs offline `npm ci`, executes the handler and cleans up. Its timeout covers all of that work. The original CI log does not identify which phase consumed the time; attributing it specifically to compilation, installation, network fallback or contention would be unsupported.

Fix: a named `handlerArtifactTimeout = 120_000` applies only to this complete integration. Both builds and all existing checks remain. Sharing the build would remove the independent-build lock determinism proof. Other function-source fixtures deliberately have different import graphs, so they are not interchangeable build fixtures. No production builder cache, global timeout, retry, skip, dependency or assertion changed. The comment describes the evidence limit explicitly.

File changed: `tests/importer/artifact.test.ts` (Prettier reindents the long test call after introducing the named argument; the test body is functionally unchanged).

Before: local unchanged targeted run 1/1 passed, test body 9.70 s; the CI timeout did not reproduce. After: five separate targeted invocations, 5/5 passed (body times 6.80, 6.29, 6.23, 5.89 and 5.38 s). The 13 unselected tests in each focused invocation are test-name filtering, not newly introduced skips. The final full suite ran all 14 artifact-file tests successfully.

Evidence: `importer-before.log`, `importer-after-1.log` through `importer-after-5.log`, `supplied-ci-failure-excerpts.log`.

Remaining risk: the larger explicit budget gives headroom but does not measure or optimize an unobserved slow phase. A future Windows CI run must confirm it is sufficient; phase timing is the next useful diagnostic if it recurs.

## 2. Same-build cache eviction recovery

Root cause found in code and reproduced deterministically: registration, activation, controller changes and focus can start overlapping `SHELL_STATUS` requests. Cache-byte verification is asynchronous. An older pre-eviction ready response can arrive after a newer unavailable response and overwrite availability, version and fallback metadata. An older timeout can similarly overwrite a newer ready state. This is a proven production ordering bug; its association with the supplied intermittent browser failure remains an inference because that CI run's scheduling was not captured.

Fix: each probe captures a monotonic generation. Only the latest probe may publish its reply or error. The three-second probe deadline, user-controlled repair/update actions and storage behavior remain unchanged. The existing browser test and its assertions are unchanged.

Files changed: `apps/web/src/infrastructure/browser-shell.ts`, `apps/web/src/infrastructure/browser-shell.test.ts`.

Before: the unchanged Chromium browser case passed 20/20 locally. Three new controlled-order unit cases failed against the original implementation (32 existing cases passed): stale ready/fallback after eviction, stale unavailable after recovery, and stale timeout after readiness. After: all 35 shell-controller cases passed; Chromium desktop same-build repair passed 20/20 with zero retries.

Evidence: `shell-probe-red.log`, `shell-probe-green.log`, `eviction-before-20.log`, `eviction-after-20.log`.

Remaining risk: the original CI browser flake was not reproduced locally. Deterministic unit evidence proves the ordering fix, while repeated browser evidence proves repair and unrelated-storage preservation on this Windows host.

## 3. WebKit offline fresh-page navigation

Observed failure: supplied Ubuntu job 114988233312 failed at `freshPage.goto(server.url)`, waiting for default `load`, after cached deep-link navigation and reload succeeded. The fixture deliberately destroys origin sockets. The same suite's prior fix `082e31b` uses `domcontentloaded` plus rendered-shell checks for this outage scenario in `pwa-lifecycle.spec.ts`. Worker-script update checks can still contact the disconnected origin. A WebKit load-lifecycle interaction with that check is a supported hypothesis, not proven engine-internal causation.

Fix: apply the established `domcontentloaded` navigation/reload boundary to this test's four navigations. Preserve every original assertion; additionally require fresh-page offline readiness and assert no post-disconnection origin requests except `/sw.js`. There is no navigation retry, test retry, sleep, timeout increase or weakened assertion.

File changed: `tests/browser/pwa.spec.ts`.

Before: unchanged WebKit phone case passed 20/20 locally. After: WebKit phone case passed 20/20 locally, with zero retries and the stronger assertions.

Evidence: `pwa-before-20.log`, `pwa-after-20.log`, `supplied-ci-failure-excerpts.log`.

Remaining risk: these repeats ran on Windows, not Ubuntu; the Ubuntu-specific failure did not reproduce and still needs exact-branch CI verification after the maintainer pushes.

## Verification and review

`npm run check` exited 0. Formatting, ESLint, TypeScript, 1,380 unit tests in 67 files, architecture boundaries, dependency audit (zero vulnerabilities), production build, bundle secret scan and browser gate all passed. Browser result: 172 passed, two existing skips. Those skips are the 20,000-product performance measurement on WebKit phone/tablet; the unchanged test intentionally runs only on Chromium desktop. No new skips were added.

The known local-only `builds under the OS temp directory when no output parent is supplied` failure did not occur in this invocation. The test was not edited and ran in the full suite.

The aggregate check was launched on implementation commit `66d8697`. During the browser phase, only the importer timeout comment was corrected for factual accuracy; no executable code changed after validation. Subsequent changes are this report and normalized evidence. Formatting and `git diff --check` were rechecked for those changes; the same passing suite was not rerun solely for prose/evidence changes.

A fresh read-only reviewer inspected `c4c48ee..66d8697`, relevant source and saved evidence. No actionable functional defect was found. The reviewer identified the timeout-comment overstatement, which was corrected. This review is not Ubuntu/Windows CI evidence or real-device Safari acceptance.

New logs preserve actual failures, commands and exit codes. Terminal colors and local/runner absolute paths were redacted; new evidence uses UTF-8 without BOM and LF. Supplied full CI logs were left untouched locally; concise redacted excerpts are checked in. No credentials or clinical data were used.

## Commit list

1. `299b6a7` — fix(pwa): ignore superseded shell status probes
2. `440619c` — test(importer): budget the two-build handler integration explicitly
3. `66d8697` — test(pwa): wait for cached DOM on offline navigation
4. Final evidence commit — this report, logs, inventory and corrected timeout rationale (its SHA is reported in the final chat response).

The maintainer retains push/PR/merge authority. Required targeted repeats are complete; current-host full checks pass. Exact-branch remote CI remains unverified because pushing was expressly forbidden.
