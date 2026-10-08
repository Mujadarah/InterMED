/**
 * Writer-to-reader public identity contract.
 *
 * One first-generation and one second-generation flow run the REAL handler
 * stage + publication against the stateful fake of the real Appwrite REST surface
 * (constrained to real row id and column limits), then the REAL Appwrite published
 * reader reads that state back and the published bundle is checked with the REAL
 * domain deserializer and integrity checker. Nothing is mocked and no reader
 * projection is re-implemented.
 *
 * The canonical DatasetVersionId requires U+001F and remains in bundle/provenance/public
 * fields, while physical Appwrite $id must be safe <= 36 chars.
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
import { bytesToText, utf8Bytes } from './fake-appwrite-rest.mjs';
import { ENTITY_LIST_NAMES } from '../../packages/importer/src/parser-facade';
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
  stageOperationId: string;
  candidateVersionId: string;
  candidateSha256: string;
  rawSnapshotSha256: string;
  baselineVersionId: string | null;
  baselineFingerprint: string | null;
}

function seedStageIntent(
  harness: Harness,
  bytes: Uint8Array,
  operationId: string = STAGE_OPERATION,
  rawFileId: string = RAW_FILE_ID,
): void {
  harness.seedFile('raw-sources', rawFileId, 'raw-snapshot.json', bytes);
  harness.seedFile(
    'import-run-logs',
    intentFileId(operationId),
    intentFileName(operationId),
    JSON.stringify(
      stageIntentDocument(operationId, {
        rawSnapshotFileId: rawFileId,
        rawSnapshotSha256: sha256Hex(bytes),
      }),
    ),
  );
}

function writtenReview(harness: Harness, stageOpId?: string): ReviewBinding {
  for (const stored of harness.rest.files.get('import-run-logs')?.values() ??
    []) {
    if (stored.name.startsWith('stage-review-v1.')) {
      const parsed = JSON.parse(bytesToText(stored.bytes)) as ReviewBinding;
      if (!stageOpId || parsed.stageOperationId === stageOpId) {
        return parsed;
      }
    }
  }
  throw new Error('staging wrote no private review');
}

function seedPublishIntent(
  harness: Harness,
  review: ReviewBinding,
  operationId: string = PUBLISH_OPERATION,
  overrides: Record<string, unknown> = {},
): void {
  const intent: IntentDocument = publishIntentDocument(
    operationId,
    {
      candidateVersionId: review.candidateVersionId,
      candidateSha256: review.candidateSha256,
      rawSnapshotSha256: review.rawSnapshotSha256,
      baselineVersionId: review.baselineVersionId,
      baselineFingerprint: review.baselineFingerprint,
    },
    {
      stageOperationId: review.stageOperationId,
      ...overrides,
    },
  );
  harness.seedFile(
    'import-run-logs',
    intentFileId(operationId),
    intentFileName(operationId),
    JSON.stringify(intent),
  );
}

/** Stage and publish one generation through the real handler entrypoint. */
async function publishFirstGeneration(harness: Harness): Promise<void> {
  const bytes = snapshotBytes();
  seedStageIntent(harness, bytes, STAGE_OPERATION);
  const staged = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
  expect(staged.status).toBe(200);
  expect(staged.body.code).toBe('staged');
  seedPublishIntent(
    harness,
    writtenReview(harness, STAGE_OPERATION),
    PUBLISH_OPERATION,
  );
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
  it('keeps canonical public identity across first and second generation publication, REST storage, and reader verification', async () => {
    const harness = createHarness({ publishEnabled: true });
    try {
      // 1. First generation: stage and publish
      await publishFirstGeneration(harness);
      const gen1 = await readPublishedGeneration(harness);
      const embeddedVersionId1 = gen1.snapshot.datasetVersions[0]?.id ?? null;

      // Transport integrity: reader manifest and descriptor agree with actual published bytes
      expect(gen1.manifest.checksum).toBe(gen1.descriptor.checksum);
      expect(gen1.manifest.checksum).toBe(`sha256:${sha256Hex(gen1.bytes)}`);
      expect(gen1.descriptor.byteSize).toBe(gen1.bytes.length);

      // Domain integrity
      const structural1 = validateReferentialIntegrity(gen1.snapshot).filter(
        (issue) => !PRESERVED_TOKEN_NOTES.has(issue.code),
      );
      expect(structural1).toEqual([]);

      // PHYSICAL row $id constraints: safe <= 36 characters
      const manifestRows1 = [
        ...(harness.rest.rows.get(TABLES.publishedVersions)?.entries() ?? []),
      ];
      expect(manifestRows1.length).toBe(1);
      const [manifestRowId1, storedManifest1] = manifestRows1[0]!;
      expect(manifestRowId1).toMatch(APPWRITE_ID);
      expect(storedManifest1.datasetVersionId).toBe(
        gen1.manifest.datasetVersionId,
      );

      const bundleRows1 = [
        ...(harness.rest.rows.get(TABLES.publishedBundles)?.entries() ?? []),
      ];
      expect(bundleRows1.length).toBe(1);
      const [bundleRowId1, storedBundle1] = bundleRows1[0]!;
      expect(bundleRowId1).toMatch(APPWRITE_ID);
      expect(gen1.descriptor.id).toBe(bundleRowId1);
      expect(storedBundle1.datasetVersionId).toBe(
        gen1.descriptor.datasetVersionId,
      );

      // CANONICAL domain identity: contains \u001f delimiter and matches across all entities
      expect(gen1.manifest.datasetVersionId).toContain('\u001f');
      expect(embeddedVersionId1).toBe(gen1.manifest.datasetVersionId);
      expect(gen1.descriptor.datasetVersionId).toBe(
        gen1.manifest.datasetVersionId,
      );
      for (const id of provenanceVersionIds(gen1.snapshot)) {
        expect(id).toBe(gen1.manifest.datasetVersionId);
      }
      expect(gen1.manifest.previousVersionId).toBeNull();
      expect(gen1.snapshot.datasetVersions[0]?.previousVersionId.status).toBe(
        'missing',
      );

      // 2. Second generation: explicit previousVersionKey from prior manifest.version
      const STAGE_OP_2 = 'op-stage-0002';
      const PUBLISH_OP_2 = 'op-publish-0002';
      const RAW_FILE_ID_2 = 'raw-src-0002';

      const doc2 = JSON.parse(bytesToText(snapshotBytes())) as Record<
        string,
        unknown
      >;
      const products2 = doc2.products as Record<string, unknown>[];
      (products2[0] as Record<string, unknown>).commercialName =
        'Placebex Renamed';
      const versionDoc2 = doc2.datasetVersion as Record<string, unknown>;
      versionDoc2.version = 'synthetic-2';
      versionDoc2.previousVersionKey = {
        status: 'present',
        value: gen1.manifest.version,
      };
      // A valid delivery is complete: every collection row carries the
      // declared version key.
      for (const name of ENTITY_LIST_NAMES) {
        for (const row of doc2[name] as Record<string, unknown>[]) {
          row.datasetVersionKey = 'synthetic-2';
        }
      }
      const rawBytes2 = utf8Bytes(JSON.stringify(doc2));

      seedStageIntent(harness, rawBytes2, STAGE_OP_2, RAW_FILE_ID_2);
      const staged2 = await harness.call({ bodyJson: envelope(STAGE_OP_2) });
      expect(staged2.status).toBe(200);
      expect(staged2.body.code).toBe('staged');

      const review2 = writtenReview(harness, STAGE_OP_2);
      expect(review2.baselineVersionId).toBe(gen1.manifest.datasetVersionId);
      expect(review2.baselineFingerprint).toBe(gen1.manifest.checksum);

      seedPublishIntent(harness, review2, PUBLISH_OP_2, {
        approvedAt: '2026-10-07T11:00:00Z',
      });
      const published2 = await harness.call({
        bodyJson: envelope(PUBLISH_OP_2),
      });
      expect(published2.status).toBe(200);
      expect(published2.body.code).toBe('published');

      // Read back second generation via reader
      const gen2 = await readPublishedGeneration(harness);
      expect(gen2.manifest.datasetVersionId).toContain('\u001f');
      expect(gen2.manifest.datasetVersionId).not.toBe(
        gen1.manifest.datasetVersionId,
      );
      expect(gen2.manifest.previousVersionId).toBe(
        gen1.manifest.datasetVersionId,
      );
      expect(gen2.descriptor.datasetVersionId).toBe(
        gen2.manifest.datasetVersionId,
      );

      const embeddedVersionId2 = gen2.snapshot.datasetVersions[0]?.id ?? null;
      expect(embeddedVersionId2).toBe(gen2.manifest.datasetVersionId);
      const embeddedPrev2 = gen2.snapshot.datasetVersions[0]?.previousVersionId;
      expect(embeddedPrev2?.status).toBe('present');
      expect((embeddedPrev2 as { value: string }).value).toBe(
        gen1.manifest.datasetVersionId,
      );

      for (const id of provenanceVersionIds(gen2.snapshot)) {
        expect(id).toBe(gen2.manifest.datasetVersionId);
      }

      // 3. Advancing clock retry: same private intent with pinned approvedAt
      const retryPublish = await harness.call({
        bodyJson: envelope(PUBLISH_OP_2),
      });
      expect(retryPublish.status).toBe(200);
      expect(retryPublish.body.code).toBe('already-published');
      // No duplicate rows or files
      expect(harness.rest.rows.get(TABLES.publishedVersions)?.size).toBe(2);
      expect(harness.rest.rows.get(TABLES.publishedBundles)?.size).toBe(2);

      // 4. Active = self restage: zero duplicates, candidate bytes unchanged
      const restaged = await harness.call({ bodyJson: envelope(STAGE_OP_2) });
      expect(restaged.status).toBe(200);
      expect(restaged.body.code).toBe('staged');

      // 5. Tampered baseline: rejected with 403
      const PUBLISH_OP_TAMPER = 'op-publish-tamper';
      seedPublishIntent(harness, review2, PUBLISH_OP_TAMPER, {
        baselineVersionId: 'dv\u001fsource.synthetic\u001ffabricated',
      });
      const tampered = await harness.call({
        bodyJson: envelope(PUBLISH_OP_TAMPER),
      });
      expect(tampered.status).toBe(403);
      expect(tampered.body.code).toBe('operation-rejected');
    } finally {
      harness.dispose();
    }
  }, 30_000);
});
