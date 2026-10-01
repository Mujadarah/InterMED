# InterMED Appwrite infrastructure

## MVP role

Appwrite Cloud is initial infrastructure, not a distant account feature. Prefer Frankfurt/EU; the official region endpoint is `https://fra.cloud.appwrite.io/v1`. Confirm project region, service availability, costs/quotas, backups and contractual requirements during provisioning. An EU region alone does not establish health-data compliance.

Use Sites, Functions, database services and Storage. Auth is optional in later clinician-workspace phases. Realtime is optional only after a demonstrated use case; version manifests and background polling are adequate initial reference-data synchronization.

## Sites and GitHub deployment

Intended flow: reviewed GitHub revision → Appwrite Sites deployment → HTTPS PWA.

During milestone 3, explicitly configure the GitHub repository, production branch, project/root directory, install/build commands, output directory and browser platform/custom domain. React/Vite produces static assets; verify the final monorepo configuration rather than guessing it from a single-app quick start. Use a committed lockfile and reproducible dependency installation. Development/preview and production projects/configuration must be separate.

Protect production deployment through reviewed changes and deployment controls. PR previews must use synthetic or approved public reference data, no server secrets and no production write access. A preview must not masquerade as clinically validated production. Test deep-link SPA fallback, manifest scope, service-worker scope, TLS, CSP, asset cache headers and source maps before deployment.

These are planned settings: no project, domain or production deployment is configured by this documentation task.

## Functions

- `import-anmdmr`: private authorized scheduled/operator ingestion; retrieve only approved sources, validate/normalize, quarantine failures, compare snapshots.
- `sync-medications`: build and publish validated compact bundles/manifests; return compatible approved versions, not raw private import material.
- `interactions`: optional server adapter for a selected licensed provider when online access is necessary. Validate ingredient IDs/request limits and enforce provider rights. Offline records require separate permission.

Separate importer and publisher privileges. Import jobs cannot publish quarantined data automatically. Public read/query endpoints, if needed, do not imply public execution of administrative importer functions. Enforce authorization, input/schema validation, timeouts, idempotence, rate limits, bounded concurrency and safe errors. Logs use run IDs/counts/errors, not user searches or patient data.

## Database and Storage

Normalize the entities in [DATA_MODEL.md](DATA_MODEL.md), including ingredient joins, source provenance and immutable DatasetVersion history. Choose the current Appwrite database product and physical configuration in milestone 3; TablesDB is a candidate, not an already provisioned fact. Assess indexes, relational constraints enforced by the application, transactional publication, migrations, quotas and export/restore before final selection.

Store raw source snapshots/quarantine privately only if source terms allow storage. Store approved immutable dataset bundles in separate public-read resources with checksums, schema/version metadata, content review and rights status. Keep manifest promotion reversible and transactional within the selected infrastructure; do not mutate a published bundle in place.

## Permission matrix

| Resource | Anonymous/reference reader | Importer | Publisher/operator |
| --- | --- | --- | --- |
| Sites static application | Read | No content-data write | Reviewed deployment only |
| Published manifest/bundle | Read when rights permit | No promotion | Publish/rollback approved generations |
| Raw source/quarantine | None | Scoped read/write | Authorized review only |
| Normalized staging data | None | Scoped read/write | Validation/read then promotion |
| Importer/admin function | No execute | Authorized execution | Authorized operation |
| Future personal/patient data | None | None | Separate approved model, never this matrix |

Use `Role.any()` read permissions for intended public resources, with no public create/update/delete. Public-read access does not require creating an anonymous Appwrite session; do not use `Role.guests()` to unintentionally exclude later signed-in readers. Permissions are additive across table/row resources; a restrictive row does not negate a table-wide public read grant. Server API keys bypass resource permissions within their scopes: they stay in server environments and need least privilege and authorization checks.

## Environment and operations

Browser configuration may contain only nonsecret endpoint, project ID and public resource identifiers. Treat every frontend build-time variable as public. API keys, provider credentials and signing secrets are server/CI secret-store values. Commit placeholders/documentation, never live credentials. Rotate and audit keys.

Specify rollback, restore drill, source failure alerts, release approver, retention, cost monitoring and incident owner before production. Set rate limits for each custom public Function; do not assume platform endpoint limits cover custom logic. Dataset polling must be bounded/backoff-aware.

## Primary references

Checked 2026-10-01: [regions](https://appwrite.io/docs/products/network/regions), [React Sites deployment](https://appwrite.io/docs/products/sites/quick-start/react), [database products](https://appwrite.io/docs/products/databases), [TablesDB tables](https://appwrite.io/docs/products/databases/tablesdb/tables), [permissions](https://appwrite.io/docs/advanced/security/permissions), [security](https://appwrite.io/docs/advanced/security). Reverify current API/SDK/runtime choices during implementation; documentation examples are not pinned runtime recommendations.
