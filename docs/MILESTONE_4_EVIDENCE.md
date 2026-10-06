# Milestone 4 acceptance evidence

Date: 2026-10-07. Branch: `codex/m4-domain`. Scope: the medication catalogue domain model and a synthetic data-access boundary. No Appwrite configuration, backend client, publication manifest, importer, IndexedDB store, or search UI was added. The web shell was not changed. Fixtures are fictional and labeled synthetic. They are not clinical facts and they are not ANMDMR records.

Requirements addressed at model level, not as a clinical catalogue release: 23–26, 28, 31–33, 115, 118–120, 135–141, and 145. Requirement 21 stays a strategy statement: retrieval rights are unresolved, so no ANMDMR rows were imported. Requirement 22 is respected by not copying another publisher's data. Requirements 27, 29, and 30 belong to the Milestone 5 importer and are not claimed here. Requirements 107–114 and 116–117 are unchanged safety rules; this milestone adds no LLM, dose, or interaction behavior. Requirement 136 is met by synthetic fixtures and the existing mock bootstrap provider.

## Decisions where DATA_MODEL left a choice

Missing data is a discriminated field, never a usable default. `FieldState<T>` is `{ status: 'missing' }`, `{ status: 'unknown', reason }`, or `{ status: 'present', value }`. Unknown reasons are `source-marked-unknown`, `ambiguous-decimal`, `not-a-decimal`, `unrecognized-unit`, `conflicting-values`, and `not-determinable`. Optional fields are not `undefined`, because JSON would drop them. An empty array means no rows were recorded.

Units are a fourth state when the token is not acceptable. `UnitField` may be `invalid` with the verbatim `sourceText` and reason `unrecognized-unit` or `not-a-unit-token`. The allow-list (`mg`, `g`, `mcg`, `µg`, `kg`, `ml`, `mL`, `l`, `L`, `UI`, `IU`, `%`, and the listed concentration tokens) is structural membership only. It is not a clinical equivalence table and it does not convert. `µg` is not rewritten to `mcg`. A normalized decimal is a string beside the verbatim token, never a JavaScript number. `500` stays `500`. One separator normalizes a comma to a dot without stripping zeros (`0,5` → `0.5`, `1.50` → `1.50`). A token with 1–3 whole digits and exactly 3 fraction digits (`1.000`, `1,000`) is `unknown` / `ambiguous-decimal`. Anything else that is not a plain decimal is `not-a-decimal`. A missing value stays missing and is never `0`.

Canonical ids are branded strings. The material is entity kind, source id, and source record key, joined with U+001F. Display names are not key material. The same inputs always yield the same id. A blank or untrimmed key, or a C0/DEL control character, is rejected. `MedicationProduct` uses the existing `sourceProductId`. Other entities gained `sourceRecordKey`, and `DataSource` gained `sourceKey`, so an id does not depend on parsing a display name. Data-source ids use the namespace `intermed` plus that source key, because a source is not a row of another source. `parseStableId` is the inverse and fails closed on a kind mismatch.

`ATCCode` has an opaque id and a verbatim `code`. Until a rights-approved import exists, `codeSystem` is only `synthetic-illustrative` and `illustrative` is only `true`. An official WHO code cannot be stored by relabeling a synthetic row.

Manufacturer and marketing-authorization holder stay separate roles. `sourceEntityId` is not copied from `sourceRecordKey` when the source omitted it. The synthetic manufacturer `Synthetica Laboratories` keeps `sourceEntityId` missing.

Join `mappingStatus: 'confirmed'` means the row supplies an ingredient id. It is not a clinical review. External mapping `reviewStatus` is `unreviewed`, `reviewed`, or `rejected`. Synthetic mappings are `unreviewed`. Expansion copies stored strength fields and does not recompute them. `structuralCoverage` is `complete` only when the product exists, at least one join exists, every join is confirmed, and every confirmed ingredient id resolves. Review and unit problems stay visible beside a complete structural expansion. An unresolved join makes coverage `incomplete` and still returns the row.

Referential integrity returns typed issues and does not throw. It checks dangling ids, duplicate canonical ids, confirmed joins without an ingredient id, invalid units, ambiguous decimals, illustrative ATC flags, record counts, and the fingerprint. It does not flag unresolved or unreviewed mappings; expansion owns those. It does not flag a repeated source product key; identity owns that. Required instants match `YYYY-MM-DDTHH:MM:SSZ` with calendar bounds. `authorizationDate` stays a verbatim string. The fingerprint is FNV-1a 64-bit over canonical JSON (sorted object keys, stable array order) with checksums blanked first. It detects accidental edits in tests. It is not a security hash.

`MedicationCatalogueSource.load()` is the Milestone 4 contract and lives in domain. The in-memory implementation lives in data-access. The architecture name `MedicationCatalogProvider` remains the later search-capable provider. The sketched `packages/medication` package was not created.

JSON serialization is hand-rolled in domain. Zod is confined to data-access at the exact locked version `4.6.5`. Deserialize rejects unknown keys, including an `appwrite` property, re-brands ids, and requires the illustrative ATC literal. DTO validation is shape-only, so a dangling fixture can enter the snapshot. Checksums and record counts are derived by `sealCatalogue`, never accepted from the raw document. Synthetic ingestion requires each raw ingredient to carry at least one external mapping. The domain type still allows any mapping length.

The synthetic dataset is `staging`, with `clinicalReviewReference: 'not-reviewed'`, `rightsApprovalReference: 'not-approved'`, rights `unresolved`, `allowedUses` limited to `automated-test`, and the seven clinical uses prohibited. `importMethod` is `synthetic-inline`. Cache rights on the fictional document are `not-assessed`.

## Ambiguous identity states

`findAmbiguousIdentities` does not merge and does not mutate the snapshot. Every finding is `ambiguous-not-merged` with `retainedAsDistinct: true`.

| Reason                                            | When it is reported                                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `same-commercial-name-different-strength-or-form` | Same NFC commercial name, and strength or dosage-form signatures differ. The two fictional `Synthetica` rows (10 mg tablet and 20 mg capsule) stay distinct.                     |
| `same-commercial-name-different-source-key`       | Same NFC name and same strength and form, with different source id plus source product id.                                                                                       |
| `duplicate-source-product-id`                     | The same source id and source product id occur on more than one product.                                                                                                         |
| `legacy-cedilla-diacritic-variant`                | Names fold together after NFC and the legacy cedilla map (ş→ș, ţ→ț, and the capital pairs) but their NFC names differ. ă, â, and î are not folded. Comparison does not casefold. |
| `same-preferred-name-different-salt-or-form`      | Ingredient preferred names match and `saltOrForm` signatures differ.                                                                                                             |

## Test-first record

Each behaviour was asserted while the implementation still failed, then implemented. Logs are UTF-8, LF, with trailing whitespace stripped, under [docs/evidence/milestone-4-2026-10-06/](evidence/milestone-4-2026-10-06/).

| Behaviour                                                        | Red log                                                                                                      | Green log                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Stable ids, decimal tokens, units                                | [red-ids-and-quantities.log](evidence/milestone-4-2026-10-06/red-ids-and-quantities.log) (8 failed)          | [green-ids-and-quantities.log](evidence/milestone-4-2026-10-06/green-ids-and-quantities.log) (8 passed)          |
| Product / ingredient / join separation and combination expansion | [red-combination-expansion.log](evidence/milestone-4-2026-10-06/red-combination-expansion.log) (6 failed)    | [green-combination-expansion.log](evidence/milestone-4-2026-10-06/green-combination-expansion.log) (6 passed)    |
| Referential integrity and ambiguous identity                     | [red-integrity-and-identity.log](evidence/milestone-4-2026-10-06/red-integrity-and-identity.log) (10 failed) | [green-integrity-and-identity.log](evidence/milestone-4-2026-10-06/green-integrity-and-identity.log) (10 passed) |
| Domain JSON round-trip, no Appwrite payload                      | [red-serialization.log](evidence/milestone-4-2026-10-06/red-serialization.log) (2 failed)                    | [green-serialization.log](evidence/milestone-4-2026-10-06/green-serialization.log) (2 passed)                    |
| Zod synthetic fixture, dangling ids, swappable source            | [red-synthetic-source.log](evidence/milestone-4-2026-10-06/red-synthetic-source.log) (10 failed)             | [green-synthetic-source.log](evidence/milestone-4-2026-10-06/green-synthetic-source.log) (10 passed)             |

The synthetic fixture covers one ingredient (`Fictivol`), a three-ingredient combination (`Placebex`: Placebexium, Synthetinum, Fictovolol), the same commercial name at two strengths and forms, omitted fields (`Vacantol`), comma-below and cedilla Romanian letters, an invalid unit (`Unitox`), a preserved microgram token (`Quantix`), and dangling ingredient, manufacturer, and source ids (`Danglebex`). ATC codes on that fixture are only `SYN-FICT-01` and `SYN-FICT-02`, both illustrative. A second document whose only product is `Swapex` replaces the in-memory source without a domain change. A document with `synthetic: false`, or an ATC row claiming `WHO-ATC`, is rejected.

## Verification results

Local Windows, Node `v24.21.0`, pinned toolchain on `PATH`. Zod `4.6.5` was already in the lockfile through `apps/web`. It was added to `@intermed/data-access` at that exact version by editing `package.json` and the workspace lock entry. No registry install was run. `npm audit --audit-level=low` inside the check below reported 0 vulnerabilities.

`npm run check` was run once after the domain, data-access, and boundary commits. The captured log is [check.log](evidence/milestone-4-2026-10-06/check.log). Exit code 0. The script is `format:check && lint && typecheck && test && check:boundaries && audit && build && test:browser`, so each of those steps exited 0 in that run.

| Step inside `npm run check`   | Observed result in check.log                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | All matched files use Prettier code style                                                          |
| `npm run lint`                | ESLint finished with no error output                                                               |
| `npm run typecheck`           | `tsc` for the root project and for `packages/domain` (no DOM lib)                                  |
| `npm run test`                | 12 files, 62 tests passed (26 domain, 10 synthetic-source, plus existing shell and boundary tests) |
| `npm run check:boundaries`    | 32 source files; dependency-free domain                                                            |
| `npm audit --audit-level=low` | 0 vulnerabilities                                                                                  |
| `npm run build`               | Vite production build completed                                                                    |
| `npm run test:browser`        | 135 passed                                                                                         |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings from child processes. Those warnings did not change the exit code. This document was added after that check. `npm run format:check` was run again on the tree that includes this file.

No medication screen was added, so there was no new UI flow to exercise. The Playwright suite is the shell regression check.

## Open risks and the next gate

ANMDMR redistribution, storage, and display rights are unresolved. These fixtures must not be treated as a Romanian catalogue. The structural unit list must not be used to convert doses. Unreviewed mappings and `structuralCoverage: 'complete'` are not clinical clearance. The fingerprint is not a cryptographic content hash. Official ATC, UCUM, and search indexes are out of scope. The catalogue is not wired into `apps/web`.

Milestone 5, the importer, needs source-rights approval before any real retrieval, parse of an upstream file, or publication. Do not start that work from this branch.
