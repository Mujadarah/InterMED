# 0002 — Appwrite environment strategy and deployment pipeline

- **Status:** Accepted as configuration-as-code on 2026-10-06. Development
  project **`intermed-dev` provisioned** on 2026-10-07 (Frankfurt). Production
  project **not** created; capacity deferred. Development buckets, tables, and
  the Milestone 3 function stub were pushed and read back on 2026-10-07;
  one fictional synthetic generation was published and read back by the
  adapter; permission retries, successful Sites deployment, and production
  remain out of scope.
- **Scope:** Milestone 3 (requirements R11, R12, R13, R16, R125, R127). Defines
  development/production isolation, secret handling and the future
  deployment/rollback pipeline.

## Context

[APPWRITE.md](../../plan/APPWRITE.md) requires development/preview infrastructure
to be separated from production privileges and data, prefers a Frankfurt/EU
region, and confines browser configuration to nonsecret identifiers. Milestone 2
already created an isolated static test site (project `6ac4b25b0012379cf3d0`,
site `6ac4b3550003a26eea02`) for the development shell; it must stay untouched.
On 2026-10-07 the owner approved a **separate** new development project rather
than sharing or falling back to that shell project.

## Decision

1. **One Appwrite project per environment**, both in Frankfurt
   (`https://fra.cloud.appwrite.io/v1`):

   | Environment | Project id / placeholder | Configuration file                                | Provisioning status (2026-10-07)                    |
   | ----------- | ------------------------ | ------------------------------------------------- | --------------------------------------------------- |
   | Development | `intermed-dev`           | `infra/appwrite/appwrite.config.development.json` | **Created** (active; empty resources; region `fra`) |
   | Production  | `intermed-prod`          | `infra/appwrite/appwrite.config.production.json`  | **Deferred** — needs separate capacity decision     |

   Projects are isolated namespaces with their own data, keys, quotas and
   permissions. Development can therefore hold synthetic material only, and a
   development credential cannot touch production data. The Milestone 2 shell
   project is **not** a development backend fallback.

2. **Identical resource identifiers in both projects** (database `intermed-datasets`,
   the three tables, the four buckets, function `import-anmdmr`), so application
   code and documentation use one constant set per environment. Only `projectId`
   and the site identifier differ between the two files; an offline test asserts
   the two projects are isolated.
3. **Explicit config-file selection.** There is no `appwrite.config.json`, so the
   CLI can never discover an environment by accident. Every command names
   `--config-file appwrite.config.<environment>.json` (CLI 28.1.0+), or sets
   `APPWRITE_CONFIG_FILE` for a whole job. `APPWRITE_PROJECT_ID`/
   `APPWRITE_ENDPOINT` environment variables override file values and are
   therefore avoided.
4. **Secrets live only in the server/CI secret store.** The repository contains
   placeholders and nonsecret public identifiers; API keys are supplied to the
   CLI from the shell environment and to Functions at execution time. A Vitest
   secret scan asserts that no key-shaped value appears in the configuration,
   `apps/web/.env.example` or the built frontend bundle. Keys are rotated when
   staff changes or on suspected exposure.
5. **Browser configuration is public-only:** optional endpoint, project ID and
   public bucket ID in `apps/web/.env.example`, validated at startup, with mock
   mode remaining the only runtime mode (see
   [Milestone 3 evidence](../MILESTONE_3_EVIDENCE.md#deliverable-3---injected-backend-client)).
6. **Deployment pipeline (future):** reviewed merge into `main` → authorized
   deployment of that revision → verification checklist in
   [the runbook](../APPWRITE_RUNBOOK.md) → recorded evidence. Production
   deployments need an explicit maintainer instruction; previews from other
   branches stay synthetic and nonclinical and never carry production write
   access. Rollback switches the active site deployment back to the retained
   healthy deployment and is rehearsed before it is needed.
7. **No GitHub Actions deploy workflow is added.** It is optional in this
   milestone, and a manual, approved step is the stricter control. If one is
   added later it must be `workflow_dispatch`-only and depend on environment
   secrets that stay unset until approval.
8. **Org capacity (live fact, 2026-10-07):** the owning organization plan is
   **GitHub Student Pack** (`auto-1`): projects limit **2**, price **0**. The
   shell project and `intermed-dev` consume both included slots. Creating
   production (or any third project) requires an explicit capacity/billing
   decision — **not** silently treated as Free-plan headroom, and **not** done
   in this stage.

## Alternatives considered

- **One project with separate databases per environment.** Rejected: shared
  keys, quotas, logs and permission blast radius defeat the isolation
  requirement (R12).
- **One parameterized configuration file.** Rejected: a single file makes it
  easy to push development content into production; two explicit files are
  auditable and testable.
- **Suffixed resource identifiers in one project.** Rejected for the same
  isolation reason, and it would leak environment names into code.
- **Reuse Milestone 2 shell project as development backend.** Rejected by owner
  instruction: shell stays unchanged; development is a separate project so
  datasets, keys and Sites settings cannot collide with the static PWA test
  host.
- **Create production immediately beside development.** Rejected for now: Student
  Pack project slots are already full; paid capacity was not approved.

## Consequences

- Development project contains the approved synthetic resource definitions, the
  Milestone 3 function stub, one fictional published generation, and disposable
  guard fixtures. The initial permission matrix was inconclusive; no clinical
  approval is implied, and no production resource was changed
  ([runbook](../APPWRITE_RUNBOOK.md)).
- Production remains unprovisioned until capacity is decided and approved; both
  environments must still be monitored once both exist.
- The duplicated resource arrays in the two files are deliberate. A drift check
  compares them offline (the permission tests load and assert both), so a change
  to one environment must be mirrored deliberately.
- Region is fixed at project creation; moving regions means new projects.
- The existing Milestone 2 test site remains out of scope except for authorized
  read-only origin checks recorded in
  [live evidence](../evidence/milestone-3-live-2026-10-07/README.md).
