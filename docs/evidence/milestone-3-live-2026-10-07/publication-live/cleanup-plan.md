# Guard cleanup plan — executed with owner approval

This plan targeted the development project
`intermed-dev` through
`infra/appwrite/appwrite.config.development.json`, and was executed only after
separate owner approval **after** the corrected probes and evidence review. The
seven targets were exactly the disposable guard objects:

| Kind | Resource             | ID                        |
| ---- | -------------------- | ------------------------- |
| row  | `dataset-bundles`    | `guard-bundle`            |
| row  | `dataset-versions`   | `guard-version`           |
| row  | `import-runs`        | `guard-run`               |
| file | `raw-sources`        | `guard-rawsources`        |
| file | `quarantine`         | `guard-quarantine`        |
| file | `import-run-logs`    | `guard-importrunlogs`     |
| file | `published-datasets` | `guard-publisheddatasets` |

The exact commands are in `cleanup-plan.json`; each of the seven command
strings explicitly pins
`infra/appwrite/appwrite.config.development.json` with `--config-file`. The row syntax
`tablesdb delete-row --database-id ... --table-id ... --row-id ...` and file
syntax `storage delete-file --bucket-id ... --file-id ...` were checked against
cached `appwrite-cli@28.1.0 --help` output. The actual seven-command results
are in [`../cleanup-live/delete-results.json`](../cleanup-live/delete-results.json):
all seven delete commands exited 0. The owner-side repeat is retained in
[`../cleanup-live/owner-not-found-results.jsonl`](../cleanup-live/owner-not-found-results.jsonl)
and exited 1 for each target with only requested-row/file-not-found messages.
The CLI output does not provide an HTTP status or error type, so neither is
inferred here.

The published version, bundle, and file `aba05ea1b8fc3e49f18d517b` were
preserved and re-read from `../cleanup-live/preserved-*.json`. The final saved
script adapter read is recorded under
`../adapter-final-after-cleanup/verification.json`: the expected version
appeared in both manifest and descriptor, no guard was selected, and two REST
requests were recorded. Both `cleanup` and `finalread` are **PASS** for this
bounded evidence.
