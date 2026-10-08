# Core Public Identity & Lineage Repair API Note

**Date:** 2026-10-08
**Scope:** Core importer architecture & bridge author integration contract

---

## 1. Core Canonical Domain IDs

- The core `DatasetVersionId` remains strictly canonical with the `\u001F` delimiter:
  `dv\u001f<sourceKey>\u001f<generationVersionKey>`
- Domain canonical IDs are **never** opaque or rebased.
- Real serializer (`serializeCatalogue` / `deserializeCatalogue`), integrity checks (`validateReferentialIntegrity`), and `deriveStableId` operate on this canonical format.
- Canonical IDs are preserved across candidate bytes, `review.candidateVersionId`, `manifest.datasetVersionId`, `descriptor.datasetVersionId`, and `snapshot.datasetVersions[0].id`.

---

## 2. Published Descriptor ID & Safe Filename

- **`descriptor.id`**:
  - Deterministic plain string adhering to Appwrite TablesDB resource ID limits: `1..36` characters matching `/^[A-Za-z0-9._-]{1,36}$/`.
  - Computed deterministically:
    ```ts
    const descriptorId = ports.sha256
      .hash(`bundle-${candidateVersionId}`)
      .substring(0, 36);
    ```
- **`descriptor.fileName`**:
  - Safe filename with **no U+001F** control characters.
  - Computed deterministically:
    ```ts
    const fileName = `bundle-${descriptorId}.json`;
    ```
  - Bundle bytes and sealed content remain byte-for-byte identical; only the filename and descriptor ID avoid control characters.

---

## 3. Public URL Port & HTTPS Validation

- **`PublishPorts` extension**:
  ```ts
  export interface PublishPorts {
    ...
    publicBaseUrl?: string;
    resolvePublicUrl?: (datasetVersionId: string, fileName: string) => string;
  }
  ```
- **Resolution Behavior**:
  - If `resolvePublicUrl` is provided, it is invoked with `(candidateVersionId, fileName)`.
  - Otherwise, defaults to `${(publicBaseUrl ?? 'https://published.invalid').replace(/\/+$/, '')}/${fileName}`.
- **Validation Rules before Publication**:
  Before any public writes (bundle file, descriptor row, manifest row), `descriptor.url` is strictly validated:
  - Must be an absolute URL with `https:` protocol.
  - Must **not** contain user credentials (`username` and `password` must be empty).
  - Must **not** contain URL fragments (`hash` must be empty).
  - Must **not** contain ASCII control characters (`\u0000`–`\u001F`, `\u007F`).
  - Violations result in immediate rejection: `{ status: 'rejected', reason: 'invalid-public-url' }` with zero public writes.

---

## 4. `datasetVersion.minimumClientVersion` Contract

- Must be non-empty, trimmed numeric semver format: `x.y.z` matching `/^\d+\.\d+\.\d+$/`, maximum 50 characters.
- Padded strings (e.g. `' 1.0.0 '`), blank strings, or malformed strings (e.g. `'1.0'`, `'v1.0.0'`, non-numeric) are quarantined during staging (`invalid-minimum-client-version`) and rejected before publication.
- Valid future versions (e.g. `'99.0.0'`) are preserved without false import failure.

---

## 5. Lineage Semantics & Baseline Verification

- **Explicit Raw Lineage**:
  - Lineage originates from `raw.datasetVersion.previousVersionKey` in the raw input snapshot.
  - Being part of the raw snapshot, it is naturally incorporated into `snapshotSha256` and the sealed catalogue.
  - Candidate bytes derive `snapshot.datasetVersions[0].previousVersionId` via `deriveStableId('DatasetVersion', sourceKey, raw.datasetVersion.previousVersionKey)`.
  - **No runtime baseline injection**: the importer never mutates candidate bytes with runtime baseline values.
- **Verification against Reviewed Baseline**:
  - **Initial generation** (`baselineVersionId === null`):
    - Raw snapshot must not declare a `previousVersionKey` (must be missing/null).
    - If an unexpected key is provided, the run is quarantined with `baseline-mismatch`.
    - Both `manifest.previousVersionId` and embedded `previousVersionId` are `null` / missing.
  - **Subsequent generations** (`baselineVersionId !== null`):
    - Raw snapshot must provide an explicit `previousVersionKey` whose derived stable ID matches `baseline.baselineVersionId`.
    - Missing or mismatched key results in quarantine with `baseline-mismatch`.
    - Upon match, both `manifest.previousVersionId` and embedded `datasetVersion.previousVersionId` equal the same canonical ID.
  - **Retry / Restage when `active = self`**:
    - If `baseline.baselineVersionId === candidateVersionId`, the generation is already active.
    - Restaging preserves the original review data, identity, and candidate bytes without error.
    - Republication settles under lease and returns `already-published` with zero duplicate writes.
  - **Concurrent / Stale Baseline**:
    - If a genuine different baseline is committed concurrently, publication is rejected with `stale-baseline`.

---

## 6. UTF-8 & File Hygiene

- All source and test files are UTF-8 without BOM, using LF line endings.
- BOMs stripped from `packages/importer/src/parser-facade.ts` and `packages/importer/src/stage.ts`.
