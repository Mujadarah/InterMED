# Guard cleanup plan — pending owner approval

This plan is documentation only. It targets the development project
`intermed-dev` through
`infra/appwrite/appwrite.config.development.json`, and must not be executed
until the owner gives separate approval **after** the corrected probes and
evidence review. The seven targets are exactly the disposable guard objects:

| Kind | Resource             | ID                        |
| ---- | -------------------- | ------------------------- |
| row  | `dataset-bundles`    | `guard-bundle`            |
| row  | `dataset-versions`   | `guard-version`           |
| row  | `import-runs`        | `guard-run`               |
| file | `raw-sources`        | `guard-rawsources`        |
| file | `quarantine`         | `guard-quarantine`        |
| file | `import-run-logs`    | `guard-importrunlogs`     |
| file | `published-datasets` | `guard-publisheddatasets` |

The exact commands are in `cleanup-plan.json`. The row syntax
`tablesdb delete-row --database-id ... --table-id ... --row-id ...` and file
syntax `storage delete-file --bucket-id ... --file-id ...` were checked against
cached `appwrite-cli@28.1.0 --help` output. No cloud operation was performed
for this plan.

Do not touch the published version, bundle, or file
`aba05ea1b8fc3e49f18d517b`. After approved cleanup, run the final real-adapter
read and assert that `version-aba05ea1b8fc3e49f18d517b` is never a guard
object. Until approval, cleanup, and that read are complete, both `cleanup`
and `finalread` remain **PENDING OWNER APPROVAL**.
