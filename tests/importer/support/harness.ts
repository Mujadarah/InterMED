import {
  deserializeCatalogue,
  type MedicationCatalogueSnapshot,
} from '@intermed/domain';
import { stage } from '../../../packages/importer/src/stage';
import type {
  CanonicalImporterConfig,
  ImportIdentity,
  ReviewApproval,
  ReviewData,
} from '../../../packages/importer/src/core';
import type { FakeStore } from './fake-ports';
import {
  buildRawDocument,
  rawBytes,
  testConfig,
  type RawEnvelopeDocument,
  type RawOptions,
} from './synthetic-raws';

/** One staged generation together with its real review and approval. */
export interface StagedGeneration {
  candidateVersionId: string;
  config: CanonicalImporterConfig;
  identity: ImportIdentity;
  review: ReviewData;
  approval: ReviewApproval;
  snapshot: MedicationCatalogueSnapshot;
  raw: RawEnvelopeDocument;
}

/** Decode staged candidate bytes with the real codec, throwing for missing or invalid data. */
export function deserialized(
  bytes: Uint8Array | undefined,
): MedicationCatalogueSnapshot {
  if (!bytes) throw new Error('candidate bytes are missing');
  const result = deserializeCatalogue(new TextDecoder().decode(bytes));
  if (!result.ok) throw new Error('candidate does not deserialize');
  return result.snapshot;
}

/** Build a fictional approval from actual review bindings with scenario-specific overrides. */
export function approve(
  review: ReviewData,
  overrides: Partial<ReviewApproval> = {},
): ReviewApproval {
  return {
    candidateVersionId: review.candidateVersionId,
    candidateSha256: review.candidateSha256,
    configSha256: review.configSha256,
    rawSnapshotSha256: review.rawSnapshotSha256,
    baselineVersionId: review.baselineVersionId,
    baselineFingerprint: review.baselineFingerprint,
    approvedBy: 'Synthetic Operator',
    approvedAt: '2026-10-07T11:00:00Z',
    approvalReference: 'SYNTHETIC-APPROVAL-1',
    largeRemovalApproved: false,
    operationalApproval: true,
    ...overrides,
  };
}

/** Stage one synthetic generation into the stateful store. */
export async function stageGeneration(
  store: FakeStore,
  options: RawOptions | RawEnvelopeDocument,
  config: CanonicalImporterConfig = testConfig(),
): Promise<StagedGeneration> {
  let raw: RawEnvelopeDocument;
  if ('format' in options) {
    raw = options;
  } else {
    const rawOpts = { ...options };
    if (
      rawOpts.previousVersionKey === undefined &&
      store.baseline.baselineVersionId !== null &&
      store.baseline.catalogue?.datasetVersions[0]?.version
    ) {
      rawOpts.previousVersionKey =
        store.baseline.catalogue.datasetVersions[0].version;
    }
    raw = buildRawDocument(rawOpts);
  }
  const result = await stage({
    config,
    snapshotBytes: rawBytes(raw),
    encoding: config.parserEncoding,
    ports: store.stagePorts(),
  });
  if (result.status !== 'staged') {
    throw new Error(`staging failed: ${result.completenessStatus}`);
  }
  const candidateVersionId = result.identity.datasetVersionId;
  const review = store.reviews.get(candidateVersionId);
  if (!review) throw new Error('staging wrote no review');
  return {
    candidateVersionId,
    config,
    identity: result.identity,
    review,
    approval: approve(review),
    snapshot: deserialized(store.candidates.get(candidateVersionId)),
    raw,
  };
}
