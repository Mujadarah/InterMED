# Development live schema migration — 2026-10-09

The owner explicitly approved this schema migration and post-migration probes
for Appwrite project `intermed-dev`, Frankfurt endpoint
`https://fra.cloud.appwrite.io/v1`, database `intermed-datasets`.
The reviewed config is the committed development config at
`d770cedd27f19d294b6339d175f4743fa09d5412`. GitHub verified that main was at this
commit, PRs #13–#16 were merged, and both main verification jobs succeeded.

**Schema migration: executed and verified. Overall M5/live acceptance: not
claimed.** The final full local check passed; the bounded permission rerun
retains six inconclusive checks, and earlier failures remain below. No production project, Function deployment, authenticated Function
execution, live import, publication, backfill or destructive fallback occurred.
No source changes were made to `apps/web/**` or `packages/local-store/**`.
The required checks produced ignored build/test outputs only.

## Plan, preflight and scope

The plan was shown before any live change: record schema and counts; attempt
the two widenings in place first; add the nullable column and its unique index;
poll availability; compare the full schema, preserve existing rows, and rerun
the reader/permission probes. Stop on an Appwrite resize rejection before any
destructive alternative. Existing nulls remain valid; no backfill was planned
or performed.

OpenCode `nvidia/z-ai/glm-5.3` and independent reviewer
`opencode/step-5-preview-free` each read all **60** tracked Markdown files,
including the hidden `.github` template, in a public-only archived snapshot.
They found no controlling contradiction with the owner's current approval.
Their reports are static preflight reviews, not live execution/acceptance
proof. The lead verified GitHub provenance and performed the CLI operations.
The initial full-repository worker dispatch was rejected by automatic approval
review; the accepted retry used only verified-public committed files, excluding
credentials, untracked files and live captures.

Evidence: [the evidence pack](evidence/live-schema-2026-10-09/README.md).
Raw logs were written outside the repository first. Copies use redacted machine
paths, UTF-8 without BOM, LF endings, and preserve observed failures. No API key,
session token or credential value was copied. The recorded UTC timestamps fall
on October 8; the execution date in Europe/Bucharest was October 9.

## Schema before and after

| Item                                             | Before                                    | After                                                                       |
| ------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| `dataset-versions.datasetVersionId`              | absent                                    | varchar(512), required false, array false, default null                     |
| `dataset-versions.datasetVersionId_unique`       | absent                                    | unique, columns `[datasetVersionId]`, lengths `[0]`, orders `[]`, available |
| `dataset-versions.previousVersionId`             | varchar(64), required false, default null | varchar(512), required false, default null, available                       |
| `dataset-bundles.datasetVersionId`               | varchar(64), required true, default null  | varchar(512), required true, default null, available                        |
| Bundle `datasetVersionId_unique`                 | unique, available                         | same existing index; not dropped/recreated                                  |
| Public table permissions                         | `read("any")` only                        | unchanged                                                                   |
| Public table row security                        | false                                     | unchanged                                                                   |
| Private `import-runs` permissions / row security | `[]` / false                              | unchanged                                                                   |
| Importer `execute` / deployment                  | `[]` / `6ac609c6a82ddcf43394`             | unchanged                                                                   |

Full column/index/table readbacks are retained for all three tables.
[Before comparison](evidence/live-schema-2026-10-09/schema-before-comparison.json)
found exactly the four planned changes plus their column/index count effects.
[After comparison](evidence/live-schema-2026-10-09/schema-after-comparison.json)
reports **zero differences** for every declared property: types, sizes,
required/array flags, enum elements, index columns/orders and full lengths,
table permissions, row security, names and enabled flags. Server-generated
metadata and unspecified defaults are excluded; the null defaults of both
resized columns were separately verified in the operation responses.

| Table              | Before rows | After migration | After probes |
| ------------------ | ----------: | --------------: | -----------: |
| `dataset-versions` |           1 |               1 |            1 |
| `dataset-bundles`  |           1 |               1 |            1 |
| `import-runs`      |           0 |               0 |            0 |

[Row fingerprints](evidence/live-schema-2026-10-09/row-preservation.json) match
before/after for all existing fields, IDs, ACLs and timestamps, omitting only
the newly added null attribute for comparison. The legacy manifest keeps
`datasetVersionId: null`. The published bundle download matched its original
SHA-256 and byte size.

## Commands and observed results

All Appwrite calls use pinned CLI `28.1.0` and the explicit development config.
The [operation command records](evidence/live-schema-2026-10-09/commands.json)
contain the exact invocations and exit codes; the
[runbook](APPWRITE_RUNBOOK.md#storage-schema-prerequisite-development-verified-2026-10-09)
has the executed PowerShell commands and null-preservation procedure.

| Command group                                                     | Result                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `tablesdb get-table`, `list-columns`, `list-indexes`, `list-rows` | Before/after captures, exit 0; counts unchanged                              |
| Initial REST `update-varchar-column` without `--xdefault`         | exit 1, local required-flag validation; no API call or change                |
| `graphql query`, explicit `default: null`, previous ID resize     | exit 0, no GraphQL errors; size 512, required false, default null, available |
| `graphql query`, explicit `default: null`, bundle ID resize       | exit 0, no GraphQL errors; size 512, required true, default null, available  |
| `create-varchar-column`, then `get-column` polling                | exit 0; nullable varchar(512), available                                     |
| `create-index`, then `get-index` polling                          | exit 0; unique index available                                               |
| Complete schema comparison and row fingerprint verification       | exit 0; zero schema differences, preserved rows                              |
| Bounded M3 probes and saved-script public reader                  | runner exit 1 due to six inconclusive row denial checks; reader passed       |
| `functions get`                                                   | exit 0; execute empty and original deployment unchanged                      |

The REST CLI requires a string `--xdefault` for column updates. The official
CLI tag `28.1.0` source was inspected to confirm this limitation. GraphQL
introspection/validation confirmed the live mutation name and nullable default.
The CLI GraphQL operation sent actual null, preserving the schema; Windows
embedded-quote escaping was verified before the mutations. No broad table push
or column/index deletion was used.

## Live probes and limits

The [anonymous probe record](evidence/live-schema-2026-10-09/anonymous-m3-probes.json)
contains **33** checks: **27 strict passes**, **6 inconclusive** results, no
unexpected write success and no abort. It used only the project header with
`credentials: omit`; no key or session.

- Public table lists and existing synthetic rows, public file metadata and
  download: HTTP 200, including checksum verification.
- Private import-run list and all three private bucket lists: HTTP 401.
- Anonymous row creates and Storage create/update/delete requests: HTTP 401.
- Anonymous importer execution attempt: HTTP 401; no execution was created.
- Six row PATCH/DELETE requests addressed fresh nonexistent synthetic IDs and
  returned `404 row_not_found`. The strict expected 401/403 was **not** met.
  These results do not prove denied updates/deletes against existing rows and
  are not reclassified as passes or owner-verified masked refusals.

No existing published row/file was addressed by a write/delete request. No
disposable guard was created; the historical nonempty **39-check** M3 guard
matrix was **not repeated**, and nonempty private-object read denial remains
outside this bounded rerun. Stronger current-head CRUD proof needs a separately
agreed disposable-guard plan, rather than risking the preserved publication.

The [public reader verification](evidence/live-schema-2026-10-09/public-reader-verification.json)
passed: two GET requests, both HTTP 200, project header only, no Auth/session/key,
available manifest and descriptor resolving to the legacy physical ID through
the null fallback. No reader write or importer call occurred.

## Repository checks and remaining gates

Primary Node `v24.21.0` / npm `11.19.0` and independent official Node
`v22.23.2` through `INTERMED_NODE22_RUNTIME` were printed in the full-check
logs. The downloaded Node 22 Windows archive was SHA-256 checked against the
official checksum list before use.

- First `npm run check`: exit 2 at typecheck, missing local
  `@intermed/importer` workspace link. Restored the committed install with
  pinned `npm ci --no-fund`, exit 0, zero audit vulnerabilities.
- Second full `npm run check`: **exit 1**. Formatting, lint, typecheck,
  **921 unit tests / 56 files**, boundaries, audit, build and dist-secret scan
  passed. Browser result: **150 passed, 2 skipped, 4 failed**. Failures were
  WebKit native activation/recovery tests; the full gate is not called green.
- Follow-up of the affected tests, unchanged assertions, scratch config with
  separate server ports and one worker: **6 passed, exit 0**. This bounded
  pass does not replace the failed full run. Earlier runner setup failures
  (busy default port, scratch cwd/module format) are retained as setup failures.
- Final full `npm run check`, repeated after the unchanged affected tests passed:
  **exit 0, 921 unit tests / 56 files, 154 browser passed / 2 skipped** on the
  original three-worker configuration and standard ports. The application
  source remained `d770ced`; the working changes were documentation/evidence
  only. [Final full log](evidence/live-schema-2026-10-09/npm-check-final-passed.log)
  supersedes the earlier failed local gate without erasing its evidence.
  [Toolchain record](evidence/live-schema-2026-10-09/toolchain.json) verifies the
  exact versions and official secondary runtime archive checksum.

PR CI/review status is a separate live gate; inspect the submitted PR's exact
head. Production creation, importer Function deployment, and live import each
remain subject to separate explicit owner approval. This evidence changes no
source-rights, clinical-review, production, device or release gate.
