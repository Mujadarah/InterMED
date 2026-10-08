# Function Handler Canonical Public Identity Repair API Report

**Document**: `task-b-handler-canonical-final-api.md`
**Date**: 2026-10-08
**Worktree**: `<worktree>`
**Branch**: `codex/m5-function-handler`

---

## 1. Summary of Changes

The function handler and storage bridge have been repaired to adhere to the canonical public identity and lineage contract established in Milestone 5:

1. **Storage Bridge Persistence**:
   - `buildManifestRow`: Persists the canonical domain `datasetVersionId` (capacity up to 512 characters, including `\u001f` delimiter) into the `datasetVersionId` attribute of `dataset-versions`. Expanded `previousVersionId` validation bound to 512 characters.
   - `buildDescriptorRow`: Persists the canonical domain `datasetVersionId` into the `datasetVersionId` column of `dataset-bundles` (capacity up to 512 characters). Takes the core-provided safe hash `descriptor.id` directly as the row physical `$id`.
   - `projectManifestRow` & `projectDescriptorRow`: Faithfully reads and returns the stored `datasetVersionId` attribute rather than synthesising or falling back when present.

2. **Public URL Resolution**:
   - Provided `ports.resolvePublicUrl(candidateVersionId, fileName)` callback in `createPublishBridge`, returning the real HTTPS Appwrite published bucket download URL (`https://fra.cloud.appwrite.io/v1/storage/buckets/published-datasets/files/${fileId}/download?project=intermed-dev`).
   - Removed the fragment (`#`) hack that previously caused core URL validation failure (`invalid-public-url`).
   - `readPublishedDescriptor` faithfully returns the real HTTPS download URL matching the descriptor.

3. **Query & Baseline Boundary**:
   - `readBaseline`: Uses the canonical domain `datasetVersionId` from the newest published manifest when querying `dataset-bundles` and returning `baselineVersionId`.
   - `readPublishedDescriptor`: Queries `dataset-bundles` using the canonical `datasetVersionId`.

4. **Intent & Validation Boundary**:
   - `infra/appwrite/functions/import-anmdmr/src/intent.js`: Introduced `isVersionId` supporting canonical tripartite identifiers up to 512 characters containing U+001F (`\u001f`).
   - Allowed safe and canonical version identifiers in `validatePublishIntent` and `parseReviewDocument` for both `candidateVersionId` and `baselineVersionId`.

5. **Test & Fake REST Alignment**:
   - `fake-appwrite-rest.mjs`: Updated column capacity and attributes for `dataset-versions` and `dataset-bundles` to match `appwrite.config.development.json` (512 characters).
   - `tests/importer/handler-reader-identity.test.ts`: Test-first regression verifying full end-to-end flow from real handler through fake REST to real M3 reader across both first and second generations, advancing clock idempotency, active=self restaging, and baseline tampering checks.
   - `tests/importer/handler-bridge.test.ts`: Updated URL expectations to assert real download URL without fragment hacks.
   - `tests/importer/handler-flow.test.ts`: Second generation stage test asserts lineage with actual prior manifest version key.

---

## 2. Gate Status

- `format:check`: Exit 0 (All files match Prettier style)
- `lint`: Exit 0 (0 errors, 0 warnings)
- `typecheck`: Exit 0 (Clean TypeScript check across all packages)
- `test`: Exit 0 (38 test files passed, 634 tests passed)
- `check:boundaries`: Exit 0 (51 source files pass architectural boundaries)
- `build`: Exit 0 (Production bundle built cleanly)
- `handler-artifact-flow.test.ts`: Exit 0 (Official Node 22.23.2 runtime executed compiled artifact with clean fake REST)
