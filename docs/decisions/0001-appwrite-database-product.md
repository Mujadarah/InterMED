# 0001 — Appwrite database product and physical configuration

- **Status:** Accepted as configuration-as-code on 2026-10-06. Not provisioned.
  Reverify the field-level notes below against the live service before the first
  `appwrite push`.
- **Scope:** Milestone 3 (requirements R15, R26, R80, R126). Controls the physical
  dataset-publication schema only; normalized medication entities arrive with
  Milestones 4–5 and are deliberately not modelled here.

## Context

[DATA_MODEL.md](../../plan/DATA_MODEL.md) defines a logical normalized model and
requires publication metadata (DatasetVersion, ImportRun) to be versioned,
traceable and immutable per generation. [APPWRITE.md](../../plan/APPWRITE.md)
leaves the choice of "the current Appwrite database product and physical
configuration" to Milestone 3 and names TablesDB only as a candidate.

Appwrite exposes two generations of database API: the current **TablesDB**
(`tablesDB` databases, `tables`, `rows`) and the legacy Databases API
(`databases`, `collections`, `documents`). The repository must commit exactly
one physical schema in one vocabulary.

## Decision

1. **Use Appwrite TablesDB** (tables and rows) as the normalized database
   product. Configuration keys are `tablesDB` and `tables`, matching the current
   CLI schema (see [the format verification](../../infra/appwrite/README.md)).
2. **One database `intermed-datasets`** with three tables:

   | Table              | Audience    | Content                                                     |
   | ------------------ | ----------- | ----------------------------------------------------------- |
   | `dataset-versions` | public read | DatasetVersion publication metadata (the download manifest) |
   | `dataset-bundles`  | public read | One immutable bundle descriptor per published generation    |
   | `import-runs`      | private     | ImportRun metadata (run IDs, counts, failures, decisions)   |

   Columns mirror [DATA_MODEL.md](../../plan/DATA_MODEL.md) field for field. The
   `status` column uses the specified enum vocabulary
   (`staging`, `validated`, `published`, `rejected`, `withdrawn`).
   `recordCounts` and `coverage` are JSON text columns (the platform has no
   object column type) and are validated again by the reader at the transport
   boundary. `rightsApprovalReference` and `clinicalReviewReference` are
   **required** columns: a publication-metadata row cannot exist without them,
   so staging material stays in the private `import-runs` table and quarantine
   bucket until approvals exist.

3. **References are enforced by the application**, not by platform relationship
   columns: `dataset-bundles.datasetVersionId` is a plain identifier column with
   a unique index. Relationship columns would move integrity semantics into a
   vendor feature whose cascade/onDelete behavior is not yet assessed, while the
   domain must stay vendor-neutral.
4. **Indexes** cover the reader query and uniqueness:
   `dataset_status_publishedAt` (`key` over `dataset`, `status`, `publishedAt`)
   and `dataset_version_unique` (`unique` over `dataset`, `version`) on
   `dataset-versions`; `datasetVersionId_unique` on `dataset-bundles`;
   `sourceId_startedAt` on `import-runs`.
5. **Publication and rollback model.** Published generations are immutable: a
   bundle file in `published-datasets` and its `dataset-bundles` row are written
   once and never edited in place. Promotion is a status change to `published`
   with `publishedAt` set (inside a TablesDB transaction where the operation
   spans rows). Rollback re-points readers at `previousVersionId` (or marks the
   bad generation `withdrawn`) and removes the bad bundle file; distributed
   copies cannot be recalled, which [DATA_SOURCES.md](../../plan/DATA_SOURCES.md)
   already requires us to plan for.

## Alternatives considered

- **Legacy Databases (collections/documents) API.** Rejected: it is the
  superseded vocabulary, its `collections`/`documents` keys are already labelled
  legacy in the CLI documentation, and adopting it would schedule a pointless
  migration.
- **One manifest document per dataset in a single table.** Rejected: publication
  history, rollback lineage and import-run traceability (R80) need queryable
  rows, not a mutable blob.
- **A separate managed relational database.** Rejected: a second vendor adds
  hosting/compliance surface and contradicts the Appwrite-first plan for the MVP
  without buying anything at this scale.

## Consequences

- Schema changes ship as reviewed config diffs and `appwrite push tables`.
  Column **type** changes require recreation and can lose data; migrations are
  additive and tested before they run against real rows.
- Referential integrity and "one bundle per generation" are enforced by the
  Milestone 5 importer/publisher and must be covered by its tests.
- Multi-column unique indexes, index `orders`, the `text`/`bigint` column types
  and the `node-22`/`other`/`static` identifiers are recorded from current
  documentation but **not live-verified**; confirm with `appwrite pull` output
  before the first push and correct the config if the live schema differs.
- Plan quotas, backup/restore drills and export tests remain open live checks
  (R15) and are listed in
  [Milestone 3 evidence](../MILESTONE_3_EVIDENCE.md#pending-live-verification).
