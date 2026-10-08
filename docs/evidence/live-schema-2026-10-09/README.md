# Development schema migration evidence — 2026-10-09

See the [migration report](../../LIVE_SCHEMA_MIGRATION_2026-10-09.md) for scope,
before/after schema, counts, exact command results and unresolved checks.

Raw captures were written to scratch outside the repository first. These
copies redact machine paths to `<repo>`, `<temp>`, `<worktree-root>` and
`<user-home>`, use UTF-8 without BOM and LF endings, and preserve observed
failures. Keys/session tokens are absent. UTC capture dates are October 8;
the execution date in Europe/Bucharest is October 9.

- `commands.json`: exact targeted schema/readback CLI invocations and exit
  codes, including the REST command that failed before any API call.
- `*-before-*` / `*-after-*`: complete table, column and index schemas and
  counts for all three declared tables. `*-post-probes-count.json`: final counts.
- `operation-*.json` and `new-*-poll-*.json`: successful GraphQL resize/additive
  responses and availability polling. Command-record files duplicate the
  corresponding entries in `commands.json`.
- `schema-*-comparison.json`, `row-preservation.json`: full declared-property
  comparison and row content/ACL/ID/timestamp fingerprints. New null manifest
  attribute omitted only for the fingerprint comparison.
- `function-before.json`, `function-after.json`: credential-free selected
  metadata; public execution empty, original deployment unchanged.
- `anonymous-m3-probes.json`: 27 strict passes, six inconclusive row-not-found
  responses, no unexpected write success. The historical nonempty 39-check
  guard matrix was not repeated.
- `adapter-read.json`, `public-reader-verification.json`: real adapter result,
  two GET-only anonymous requests and successful null fallback.
- `npm-check-final-passed.log`: final full check exit 0, 921 unit tests and
  154 browser passed / 2 skipped. Earlier `npm-check-*.log` failures remain
  retained; `toolchain.json` records exact versions and Node 22 archive integrity.
  `npm-ci.log`: lockfile
  installation repair. `browser-followup-passed.log`: six affected cases pass
  with isolated ports/one worker; the final full repeat used the original
  configuration. Other
  setup-failure logs are explicitly labelled.
- `markdown-inventory.json`, `*-preflight-report.txt`: 60-file inventory and
  requested OpenCode workers' static reviews. Their generic command suggestions
  were not executed; root's command records are authoritative. The reviewer
  attempted read-only Git inspection of the archive and it failed because the
  archive has no `.git`, despite its narrative saying it did not attempt it.
- `*.ts.txt`, `*.mjs.txt`: redacted audit copies of the scratch probe,
  comparison and isolated test configuration. Paths are placeholders; these
  are evidence, not runnable repository commands or future live approval.

No production creation, Function deployment, authenticated Function execution,
import, publication, backfill, column/index deletion or existing-row write was
performed. Denial-test updates/deletes addressed fresh nonexistent IDs only.
