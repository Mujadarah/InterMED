# Milestone 6 issue #12 follow-up evidence — 2026-10-08

All committed text output here is UTF-8 without BOM, with LF line endings and
no trailing whitespace. Machine-specific path segments in command output are
redacted to repository-neutral placeholders (`<worktree>`, `<repo>`,
`<home>`); commands, results, counts, durations and exit codes are otherwise
preserved verbatim.

| Log                                                                                                                                                                    | What it shows                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red-validate.log`                                                                                                                                                     | the new validator tests against the unfixed code: a correct `sha256:` checksum rejected as `checksum-mismatch`, the fixture publishing the 16-hex FNV fingerprint, an FNV-style checksum **accepted**, the notes-only bundle and the duplicate-id control stopping at `checksum-mismatch` — 5 failed / 1 passed |
| `red-new-api.log`                                                                                                                                                      | the same suite once the `decodeBundleBytes` / `NON_FATAL_DATA_QUALITY_CODES` tests were added, still unfixed: `decodeBundleBytes is not a function`, the constant `undefined` — 7 failed / 1 passed                                                                                                             |
| `green-validate.log`                                                                                                                                                   | all 8 validator tests green after the fix                                                                                                                                                                                                                                                                       |
| `gate-format-check.log`, `gate-lint.log`, `gate-typecheck.log`, `gate-test.log`, `gate-check-boundaries.log`, `gate-audit.log`, `gate-build.log`, `gate-scan-dist.log` | each quality gate on the finished tree, each exit 0; `gate-test.log` shows 415 tests in 32 files                                                                                                                                                                                                                |
| `npm-run-check.log`                                                                                                                                                    | the final full `npm run check` (every gate plus the Playwright browser suite), exit 0                                                                                                                                                                                                                           |

All fixtures in these logs and in `packages/local-store` are synthetic and
clearly fictional ("Fictivol", "Placebex", "Synthetica", "Placebo Holding",
strength "500,125 blorbz"); nothing here is a clinical fact or an ANMDMR
record.
