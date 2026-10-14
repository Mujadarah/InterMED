# M12 regression evidence (2026-10-14)

Worktree: the worktree on branch `claude/m12-regression`. Tests and evidence
only. Production code is untouched: the change set is the coverage matrix
(`COVERAGE.md`), one unit test, one Playwright spec, and a fix to the
test-only dataset harness (never shipped; its absence from the production
bundle is asserted by `tests/browser/local-store.spec.ts`). No new
dependencies were added (`fake-indexeddb` was already a dependency).

## Matrix after this work: 18 of 18 covered, 0 gaps remaining

15 scenarios were already covered by the suites named in `COVERAGE.md`. Three
gaps were filled:

| Scenario                                                                                            | Gap type                                                   | Covering test added                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| First offline startup with a cached shell (dataset stays honestly `never-downloaded` while offline) | Partial: shell half covered, dataset-honesty half missing  | `tests/browser/dataset-shell.spec.ts` — "offline startup with a cached shell and no dataset stays honest"                  |
| A shell update waiting while a dataset update is in flight                                          | Full                                                       | `tests/browser/dataset-shell.spec.ts` — "a dataset update succeeds while a shell update waits and survives its activation" |
| Clear-all-data followed by a fresh start (downloading again after the clear)                        | Partial: the clear itself covered, the fresh start missing | `packages/local-store/src/preferences.test.ts` — "downloads a fresh generation after clear-all-data"                       |

## New tests and their negative controls

Each new test was shown to fail when the behaviour it guards is broken, by a
temporary local break that was reverted afterwards and never committed:

- Unit test: with the `favorites.clear()` step of `clearAllLocalData`
  temporarily removed, "downloads a fresh generation after clear-all-data"
  fails (the stale favorite survives the clear). With the break reverted the
  file passes 17 of 17.
- Browser test 1: with the dataset status attribute temporarily hardcoded to
  `ready` in the status presentation, the offline-honesty test fails at the
  `never-downloaded` assertion. Reverted.
- Browser test 2: with shell activation temporarily deleting the
  `intermed-local` database before reload, the waiting-update test fails at
  the post-activation `ready` assertion. Reverted.
- `git diff` after the reverts shows no change to production files.

## Test-tooling fix (not a production bug)

Writing the waiting-update test exposed a staleness bug in the test-only
harness `apps/web/src/dev/local-store-harness.ts`: `state()` returned
`store.open()`, which memoizes the state of the initial open, so after the
harness staged a generation without an intervening reload it kept reporting
the install-time state (`never-downloaded`) while the application store and
the UI correctly showed the new generation as ready. The harness now awaits
`open()` and returns the live `getState()`. Production `open()` semantics
(ensure-open plus live state via `getState()`/subscriptions, as every unit
suite already uses them) are unchanged, and no production file was modified.

## Commands and pass counts

Node came from the pinned runtimes in the shared `.tools` directory
(`node-v24.21.0` on `PATH`, `INTERMED_NODE22_RUNTIME` pointing at the
`node-v22.23.2` executable for the compiled-artifact suite). `npm run build`
was run once first because the Playwright preview server requires
`apps/web/dist`.

- `npm run format:check` — pass.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npx vitest run` — 68 files, 1394 tests, all pass. (An initial run without
  `INTERMED_NODE22_RUNTIME` showed 1393 passes plus the one suite that
  requires that variable; re-running with it set gives the full green above.)
- `npx playwright test tests/browser/dataset-shell.spec.ts tests/browser/local-store.spec.ts --repeat-each=5` —
  105 of 105 pass (7 tests × 3 projects × 5 repeats), covering the new spec
  and the existing harness-state consumer.

## Real bugs found

None in production code. The only defect found was the harness staleness
described above, which lives in test-only code and was fixed there.
