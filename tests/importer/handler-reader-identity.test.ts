/**
 * Writer-to-reader public identity contract (RED: pending the core
 * public-identity repair and the bridge adaptation).
 *
 * One first-generation flow runs the REAL handler stage + publication against
 * the stateful fake of the real Appwrite REST surface (constrained to real row
 * id and column limits), then the REAL Appwrite published reader reads that
 * state back and the published bundle is checked with the REAL domain
 * deserializer and integrity checker. Nothing is mocked and no reader
 * projection is re-implemented: the reader's `datasetVersionId` is exactly the
 * manifest row `$id`, as an M3 consumer derives it.
 *
 * The contract asserted here: the manifest row `$id` that the reader hands out
 * is the same public identity as the embedded `DatasetVersion.id` and every
 * provenance `datasetVersionId` inside the published bundle, and that identity
 * is a valid Appwrite row id (<= 36 chars, `[A-Za-z0-9._-]`). The current
 * bridge derives its own hashed row id while the sealed bundle keeps the
 * composite domain id, so these assertions fail until the repaired core hands
 * over one canonical public identity that the bridge uses directly.
 */
import {
  createAppwritePublishedDatasetReader,
  type FetchLike,
} from '@intermed/data-access';
import {
  deserializeCatalogue,
  validateReferentialIntegrity,
  type MedicationCatalogueSnapshot,
  type PublishedBundleDescriptor,
  type PublishedDatasetManifest,
} from '@intermed/domain';
import {
  createHarness,
  DATASET,
  derivations,
  describe,
  envelope,
  expect,
  it,
  PUBLISH_OPERATION,
  publishIntentDocument,
  RAW_FILE_ID,
  sha256Hex,
  snapshotBytes,
  STAGE_OPERATION,
  stageIntentDocument,
  TRUSTED_RUNTIME,
  type IntentDocument,
} from './handler-fixtures';
import { bytesToText } from './fake-appwrite-rest.mjs';
import {
  BUCKETS,
  DATABASE_ID,
  TABLES,
} from '../../infra/appwrite/functions/import-anmdmr/src/runtime-config.js';

const { intentFileId, intentFileName } = derivations;

/** Real TablesDB/Storage id constraint: 1..36 of `[A-Za-z0-9._-]`. */
const APPWRITE_ID = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{0,35}$/;

/** Domain checker notes that never block a publication (see publisher). */
const PRESERVED_TOKEN_NOTES = new Set(['invalid-unit', 'ambiguous-decimal']);

type Harness = ReturnType<typeof createHarness>;

interface ReviewBinding {
  candidateVersionId: string;
  candidateSha256: string;
  rawSnapshotSha256: string;
  baselineVersionId: string | null;
  baselineFingerprint: string | null;
}

function seedStageIntent(harness: Harness, bytes: Uint8Array): void {
  harness.seedFile('raw-sources', RAW_FILE_ID, 'raw-snapshot.json', bytes);
  harness.seedFile(
    'import-run-logs',
    intentFileId(STAGE_OPERATION),
    intentFileName(STAGE_OPERATION),
    JSON.stringify(
      stageIntentDocument(STAGE_OPERATION, {
        rawSnapshotSha256: sha256Hex(bytes),
      }),
    ),
  );
}

function writtenReview(harness: Harness): ReviewBinding {
  for (const stored of harness.rest.files.get('import-run-logs')?.values() ??
    []) {
    if (stored.name.startsWith('stage-review-v1.')) {
      return JSON.parse(bytesToText(stored.bytes)) as ReviewBinding;
    }
  }
  throw new Error('staging wrote no private review');
}

function seedPublishIntent(harness: Harness, review: ReviewBinding): void {
  const intent: IntentDocument = publishIntentDocument(PUBLISH_OPERATION, {
    candidateVersionId: review.candidateVersionId,
    candidateSha256: review.candidateSha256,
    rawSnapshotSha256: review.rawSnapshotSha256,
    baselineVersionId: review.baselineVersionId,
    baselineFingerprint: review.baselineFingerprint,
  });
  harness.seedFile(
    'import-run-logs',
    intentFileId(PUBLISH_OPERATION),
    intentFileName(PUBLISH_OPERATION),
    JSON.stringify(intent),
  );
}

/** Stage and publish one generation through the real handler entrypoint. */
async function publishFirstGeneration(harness: Harness): Promise<void> {
  const bytes = snapshotBytes();
  seedStageIntent(harness, bytes);
  const staged = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
  expect(staged.status).toBe(200);
  expect(staged.body.code).toBe('staged');
  seedPublishIntent(harness, writtenReview(harness));
  const published = await harness.call({
    bodyJson: envelope(PUBLISH_OPERATION),
  });
  expect(published.status).toBe(200);
  expect(published.body.code).toBe('published');
}

function publishedReader(harness: Harness) {
  return createAppwritePublishedDatasetReader({
    endpoint: TRUSTED_RUNTIME.endpoint,
    projectId: TRUSTED_RUNTIME.project,
    databaseId: DATABASE_ID,
    versionsTableId: TABLES.publishedVersions,
    bundlesTableId: TABLES.publishedBundles,
    bundleBucketId: BUCKETS.published,
    fetchLike: harness.rest.fetch as unknown as FetchLike,
  });
}

interface PublishedGeneration {
  manifest: PublishedDatasetManifest;
  descriptor: PublishedBundleDescriptor;
  bytes: Uint8Array;
  snapshot: MedicationCatalogueSnapshot;
}

/**
 * Read one published generation exactly as an M3 consumer does: manifest and
 * descriptor from the real reader, bundle bytes from the descriptor's own URL,
 * then the real domain deserializer. No projection is re-implemented here.
 */
async function readPublishedGeneration(
  harness: Harness,
): Promise<PublishedGeneration> {
  const reader = publishedReader(harness);
  const manifestRead = await reader.getManifest(DATASET);
  expect(manifestRead.status).toBe('available');
  if (manifestRead.status !== 'available') {
    throw new Error('the published manifest is not available');
  }
  const manifest = manifestRead.value;
  const descriptorRead = await reader.getBundleDescriptor(
    manifest.datasetVersionId,
  );
  expect(descriptorRead.status).toBe('available');
  if (descriptorRead.status !== 'available') {
    throw new Error('the published bundle descriptor is not available');
  }
  const descriptor = descriptorRead.value;
  const response = (await harness.rest.fetch(descriptor.url, {
    headers: { 'X-Appwrite-Project': TRUSTED_RUNTIME.project },
  })) as unknown as Response;
  expect(response.ok).toBe(true);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const decoded = deserializeCatalogue(new TextDecoder().decode(bytes));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('the published bundle does not deserialize');
  return { manifest, descriptor, bytes, snapshot: decoded.snapshot };
}

function provenanceVersionIds(snapshot: MedicationCatalogueSnapshot): string[] {
  return [
    ...snapshot.products.map((row) => row.datasetVersionId),
    ...snapshot.activeIngredients.map((row) => row.datasetVersionId),
    ...snapshot.medicationIngredients.map((row) => row.datasetVersionId),
    ...snapshot.atcCodes.map((row) => row.datasetVersionId),
    ...snapshot.dosageForms.map((row) => row.datasetVersionId),
    ...snapshot.manufacturers.map((row) => row.datasetVersionId),
    ...snapshot.marketingAuthorizationHolders.map(
      (row) => row.datasetVersionId,
    ),
    ...snapshot.regulatoryDocuments.map((row) => row.datasetVersionId),
  ];
}

describe('writer-to-reader public identity (handler -> REST -> M3 reader)', () => {
  it('keeps one public identity from the manifest row id to the embedded catalogue', async () => {
    const harness = createHarness({ publishEnabled: true });
    try {
      await publishFirstGeneration(harness);
      const generation = await readPublishedGeneration(harness);
      const { manifest, descriptor, bytes, snapshot } = generation;
      const embeddedVersionId = snapshot.datasetVersions[0]?.id ?? null;

      // Real transport integrity: the reader's manifest and descriptor agree
      // with the actual published bytes.
      expect(manifest.checksum).toBe(descriptor.checksum);
      expect(manifest.checksum).toBe(`sha256:${sha256Hex(bytes)}`);
      expect(descriptor.byteSize).toBe(bytes.length);

      // Real domain integrity of the published bundle.
      const structural = validateReferentialIntegrity(snapshot).filter(
        (issue) => !PRESERVED_TOKEN_NOTES.has(issue.code),
      );
      expect(structural).toEqual([]);

      // THE CONTRACT: one public identity everywhere, Appwrite-safe.
      expect(manifest.datasetVersionId).toMatch(APPWRITE_ID);
      expect
        .soft(
          embeddedVersionId,
          'the embedded DatasetVersion.id must be the manifest row $id',
        )
        .toBe(manifest.datasetVersionId);
      expect
        .soft(
          embeddedVersionId,
          'the embedded DatasetVersion.id must itself be a valid Appwrite row id',
        )
        .toMatch(APPWRITE_ID);
      for (const id of provenanceVersionIds(snapshot)) {
        expect
          .soft(
            id,
            'every provenance datasetVersionId must be the manifest row $id',
          )
          .toBe(manifest.datasetVersionId);
      }
    } finally {
      harness.dispose();
    }
  }, 30_000);
});
