# Milestone 6 evidence — 2026-10-07

Machine-specific path segments in retained command output are redacted to
repository-neutral placeholders (`<worktree>`, `<repo>`, `<temp>`, `<home>`);
commands, results, warnings, counts, durations, exit codes and prose are
otherwise preserved. Only exact machine-path prefixes are replaced (including
their escaped and forward-slash spellings), and three logs written with CRLF
line endings were normalised to LF. The redaction was applied when the
path-hygiene exclusions for this folder were removed
(`tests/repository-path-hygiene.test.ts` now covers the whole repository).

All committed text output here is UTF-8 without BOM and with LF line endings
and no trailing whitespace. The logs are verbatim captures of Vitest,
Playwright, the quality gates and `npm run check` runs, one section per run
with the exact command and its exit code.

| Log                                                                                                | What it shows                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `red-codex-review.log`, `green-codex-review.log`                                                   | red/green evidence for the five Codex review findings                                                                                                                          |
| `red-greptile-review.log`, `green-greptile-review.log`                                             | red/green evidence for the six Greptile findings fixed here (G1/G4/G6 point at the Codex tests)                                                                                |
| `red-codacy-review.log`, `green-codacy-review.log`                                                 | red/green evidence for the Codacy items, including the locator stability run (5× per project)                                                                                  |
| `check-after-codex-review.log`, `check-after-greptile-review.log`, `check-after-codacy-review.log` | every quality gate and `npm run check` after each pass                                                                                                                         |
| `npm-run-check.log`, `gate-*.log`, `check-after-review.log`                                        | the original Milestone 6 gate runs                                                                                                                                             |
| `red-*.log`, `green-*.log` (other)                                                                 | the original Milestone 6 suites: staging, readers, preferences, multitab, migrations, dataset status UI, boundary rules, browser local store, persistent storage, review fixes |

All fixtures in these logs and in `packages/local-store` are synthetic and
clearly fictional ("Fictivol", "Placebex", "Synthetica", "Placebo Holding");
nothing here is a clinical fact or an ANMDMR record.
