# Appwrite infrastructure as code (not provisioned)

This folder describes the intended InterMED Appwrite Cloud infrastructure as
reviewable configuration. **Nothing here has been provisioned or deployed.** No
`appwrite login`, `appwrite init`, `appwrite pull`, `appwrite push` or
`appwrite deploy` run while this milestone was written, no Appwrite endpoint was
called and no credential was read. Applying this configuration requires a fresh,
explicit maintainer approval: see [the runbook](../../docs/APPWRITE_RUNBOOK.md),
where every command is marked **NOT YET EXECUTED — requires maintainer approval**.

The offline Vitest suites [`tests/appwrite-config-permissions.test.ts`](../../tests/appwrite-config-permissions.test.ts)
and [`tests/appwrite-config-secrets.test.ts`](../../tests/appwrite-config-secrets.test.ts)
validate these files on every `npm run test`, without network access.

## Configuration format (verified 2026-10-06)

Format choices were checked against the current official documentation, not
against a remembered CLI shape:

- The current CLI project file is **`appwrite.config.json`** (`appwrite.json` is
  the legacy name). Multiple environments use separate config files selected
  with `--config-file` or `APPWRITE_CONFIG_FILE`, available in CLI 28.1.0 and
  later ([installation](https://appwrite.io/docs/tooling/command-line/installation)).
- The current database product is **TablesDB**, whose configuration keys are
  **`tablesDB`** (databases) and **`tables`** (tables of rows). The legacy
  `collections`/`documents` vocabulary is the superseded Databases API
  ([tables](https://appwrite.io/docs/tooling/command-line/tables),
  [databases](https://appwrite.io/docs/products/databases/tablesdb/tables)).
- Column, index and bucket field names follow the CLI schema dispatcher
  (`key`, `type`, `required`, `array`, `size`, `elements`, `min`, `orders`,
  `columns`): [column types and formats](https://appwrite.io/docs/tooling/command-line/tables#column-types-and-formats).
- Permission strings use the REST vocabulary `read("any")`
  ([REST](https://appwrite.io/docs/apis/rest),
  [permissions](https://appwrite.io/docs/advanced/security/permissions)).

Field values that can only be confirmed against a live project (runtime and
build-runtime identifiers, framework and adapter identifiers, index `orders`
support) are listed in
[Milestone 3 evidence](../../docs/MILESTONE_3_EVIDENCE.md#pending-live-verification).

## Layout

| Path                               | Purpose                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `appwrite.config.development.json` | Development environment: placeholder project `intermed-dev`                     |
| `appwrite.config.production.json`  | Production environment: placeholder project `intermed-prod` (separate project)  |
| `functions/import-anmdmr/`         | Admin runner stub (Milestone 3): no ingestion, no writes, no credentials        |
| [`SITES.md`](SITES.md)             | Sites/GitHub settings, deep-link fallback and relationship to the existing site |

Both config files declare the **same resource identifiers** in **different
projects** (see [decision record 0002](../../docs/decisions/0002-environment-strategy.md)),
so application code can use one constant set per environment. Select the file
explicitly, for example:

```sh
appwrite push tables --config-file appwrite.config.development.json
```

That command is recorded for future use only and is **NOT YET EXECUTED —
requires maintainer approval**.

## Resources and permissions

Database `intermed-datasets` holds publication metadata derived from
[DATA_MODEL.md](../../plan/DATA_MODEL.md); normalized catalogue entities arrive
with Milestones 4–5 and are deliberately absent here.

| Resource                                       | Type     | Grants                              | Intent                                          |
| ---------------------------------------------- | -------- | ----------------------------------- | ----------------------------------------------- |
| `dataset-versions`                             | table    | `read("any")`                       | Published generation manifest (DatasetVersion)  |
| `dataset-bundles`                              | table    | `read("any")`                       | Immutable bundle descriptors                    |
| `import-runs`                                  | table    | none                                | ImportRun metadata; private                     |
| `published-datasets`                           | bucket   | `read("any")`                       | Approved immutable dataset bundles only         |
| `raw-sources`, `quarantine`, `import-run-logs` | buckets  | none                                | Private snapshots, failed material and run logs |
| `import-anmdmr`                                | function | no execute, no scopes, no variables | Admin runner; server/operator only              |

Effective rules enforced by the offline tests:

- The only grants anywhere are the three `read("any")` entries above. `read("any")`
  covers readers with and without an Auth session, so public reads never need an
  account or an anonymous session. No `users`, `guests`, `team`, `member` or
  `user` role appears anywhere, and no create/update/delete/write grant exists
  for any role.
- Permissions are additive across a container and its rows/files. A restrictive
  row cannot cancel a table-level `read("any")`, so only approved publication
  material may ever be written to `dataset-versions`, `dataset-bundles` and
  `published-datasets`. Withdrawal therefore removes the file/row and rolls the
  manifest back; it does not rely on a row-level denial.
- Server API keys bypass resource permissions inside their scopes. They belong
  in the server/CI secret store only and are not present in this folder, in
  `.env.example` or in any build output (asserted by the secret scan).

### Storage settings

| Bucket               | max file size | compression | encryption | antivirus | notes                                                                                |
| -------------------- | ------------- | ----------- | ---------- | --------- | ------------------------------------------------------------------------------------ |
| `raw-sources`        | 512 MiB       | none        | no         | yes       | Byte-exact originals so checksums stay verifiable                                    |
| `quarantine`         | 512 MiB       | none        | no         | yes       | Failed/untrusted material, never published                                           |
| `import-run-logs`    | 16 MiB        | none        | yes        | yes       | Encrypted at rest; larger logs are split (Appwrite cannot encrypt files above 20 MB) |
| `published-datasets` | 1 GiB         | none        | no         | yes       | Public by design; only approved immutable bundles                                    |

`compression: none` everywhere keeps the served bytes identical to the
checksummed bytes. File-extension allowlists stay empty until the Milestone 5
bundle format is chosen (recorded as an open hardening item).

## Secrets and public configuration

This folder contains **no secrets**: no API keys, no key variables, no tokens and
no credentials of any kind. The future runner receives its server key through
the function's environment at execution time (see the runbook); it is never
committed. Browser-side configuration may contain only the public endpoint,
project ID and public bucket ID; those placeholders live in
[`apps/web/.env.example`](../../apps/web/.env.example).

## Sites

Sites settings are documented in [`SITES.md`](SITES.md) and mirrored as the
`sites` entries of both config files. The existing Milestone 2 test site is out
of scope and untouched: it is not referenced by any identifier here.
