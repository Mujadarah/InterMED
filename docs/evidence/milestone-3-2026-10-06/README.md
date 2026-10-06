# Milestone 3 evidence — Appwrite infrastructure as code (2026-10-06)

Logs in this folder are UTF-8 with LF line endings and trailing whitespace
stripped. Each `*-red.txt` was produced before its implementation existed and
each `*-green.txt` after it; `gates-*.txt` and `check-final.txt` were captured on
the finished tree, and `check-preliminary.txt` records the one failing full run
described in [the evidence record](../../MILESTONE_3_EVIDENCE.md). The three
`*-review-fixes.log` files record the runs behind the
[review fixes](../../MILESTONE_3_EVIDENCE.md#review-fixes-2026-10-06-review):
each section starts with a `##` line naming the command and the next line with
its exit code. The log files themselves are inert artifacts of the runs they
record: no test, gate or build reads this folder, so a committed log never
changes what a later run verifies.

| Log                          | Command                                                                                               | Result                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `01-permissions-red.txt`     | `npx vitest run tests/appwrite-config-permissions.test.ts` (before `infra/appwrite/`)                 | failed: config missing                                                               |
| `02-secrets-red.txt`         | `npx vitest run tests/appwrite-config-secrets.test.ts` (before `infra/appwrite/`)                     | failed: config missing                                                               |
| `03-permissions-green.txt`   | `npx vitest run tests/appwrite-config-permissions.test.ts`                                            | 26 passed                                                                            |
| `04-secrets-green.txt`       | `npx vitest run tests/appwrite-config-secrets.test.ts`                                                | 4 passed (before `apps/web/dist` existed)                                            |
| `05-reader-red.txt`          | `npx vitest run packages/data-access/src/*.test.ts` (before implementation)                           | failed: modules missing                                                              |
| `06-reader-green.txt`        | `npx vitest run packages/data-access/src/*.test.ts`                                                   | 17 passed                                                                            |
| `07-config-red.txt`          | `npx vitest run apps/web/src/config.test.ts` (before the `config.ts` extension)                       | 3 failed, 8 existing tests still passing                                             |
| `08-config-green.txt`        | `npx vitest run apps/web/src/config.test.ts`                                                          | 11 passed                                                                            |
| `09-secret-scan-red.txt`     | `npx vitest run tests/appwrite-config-secrets.test.ts` (strict entropy scan, `apps/web/dist` present) | 3 failed: public shell digests flagged and a quoted key-header form missed           |
| `10-secret-scan-green.txt`   | `npx vitest run tests/appwrite-config-secrets.test.ts` (final detector, `apps/web/dist` present)      | 9 passed                                                                             |
| `gates-format-check.txt`     | `npm run format:check`                                                                                | exit 0                                                                               |
| `gates-lint.txt`             | `npm run lint`                                                                                        | exit 0                                                                               |
| `gates-typecheck.txt`        | `npm run typecheck`                                                                                   | exit 0                                                                               |
| `gates-test.txt`             | `npm run test`                                                                                        | exit 0, 10 files / 83 tests                                                          |
| `gates-check-boundaries.txt` | `npm run check:boundaries`                                                                            | exit 0, dependency-free domain                                                       |
| `gates-audit.txt`            | `npm audit --audit-level=low`                                                                         | exit 0, 0 vulnerabilities                                                            |
| `gates-build.txt`            | `npm run build`                                                                                       | exit 0, `apps/web/dist` written                                                      |
| `check-preliminary.txt`      | first `npm run check`                                                                                 | **exit 1**: the strict entropy scan flagged the shell's public SHA-256 asset digests |
| `check-final.txt`            | `npm run check` on the finished tree (including `apps/web/dist`)                                      | see log                                                                              |
| `red-review-fixes.log`       | review findings 1–3, `npx vitest run` per finding before the fixes (finding 3 = induced flag flips)   | 3 + 1 + 2 + 2 failed as expected                                                     |
| `green-review-fixes.log`     | the same runs after the fixes, plus a full `npx vitest run`                                           | 15 + 10 + 32 passed, whole suite 92 passed                                           |
| `check-after-review.log`     | `npm run format:check` … `npm run build`, then `npm run check` on the reviewed tree                   | every gate exit 0, 92 unit + 135 browser tests passed                                |
