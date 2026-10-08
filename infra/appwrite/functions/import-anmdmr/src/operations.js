/* global TextDecoder */
/**
 * Authorized operation flows.
 *
 * Authority originates only in the owner-created private operation intent that
 * the request reference points to. The caller controls that reference and
 * nothing else: no inline bytes, config, endpoints, keys, actors or approval
 * flags cross this boundary. Unauthorized or tampered flows return before any
 * data write. The publication timestamp is pinned to the immutable approval
 * timestamp of the intent, so a retry of the same publication presents the
 * identical publication even when the wall clock advances.
 */
import {
  intentFileId,
  intentMatchesOperation,
  isReservedIntentFileName,
  parseIntentDocument,
  parseReviewDocument,
  PUBLISH_INTENT_PURPOSE,
  reviewFileId,
  reviewMatchesIntent,
} from './intent.js';
import { deriveRef } from './codes.js';
import {
  BridgeError,
  createPublishBridge,
  createStageBridge,
} from './storage-bridge.js';
import { BUCKETS } from './runtime-config.js';

/** Read a downloaded Blob into a byte array for hashing or decoding. */
async function readBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Recognize explicit store absence without matching backend error messages. */
function isNotFound(error) {
  return (
    error instanceof Error &&
    error.name === 'StoreError' &&
    error.code === 'NOT_FOUND'
  );
}

/** Build an operation result from its status, code, reference and summary fields. */
function outcome(status, code, operationRef, extra = {}) {
  return { status, code, operationRef, ...extra };
}

/** Load the reserved private intent and verify its schema and operation binding. */
async function loadIntent(store, sha256, operationId) {
  const fileId = intentFileId(sha256, operationId);
  let text;
  try {
    const metadata = await store.getFileMetadata(BUCKETS.logs, fileId);
    if (!isReservedIntentFileName(metadata.name, operationId)) {
      return { kind: 'rejected' };
    }
    text = new TextDecoder().decode(
      await readBytes(await store.downloadFile(BUCKETS.logs, fileId)),
    );
  } catch (error) {
    if (isNotFound(error)) return { kind: 'unknown' };
    throw error;
  }
  const parsed = parseIntentDocument(text);
  if (!parsed.ok || !intentMatchesOperation(parsed.intent, operationId)) {
    return { kind: 'rejected' };
  }
  return { kind: 'intent', intent: parsed.intent };
}

/** Verify the intent-bound raw hash, stage the snapshot and return a bounded summary. */
async function runStage(intent, deps, operationRef) {
  const { store, sha256, core, randomToken, log } = deps;
  let rawBytes;
  try {
    rawBytes = await readBytes(
      await store.downloadFile(BUCKETS.raw, intent.rawSnapshotFileId),
    );
  } catch (error) {
    if (isNotFound(error)) {
      return outcome(404, 'operation-unknown', operationRef);
    }
    throw error;
  }
  // Raw hash verified before any parse or write.
  if (sha256.hash(rawBytes) !== intent.rawSnapshotSha256) {
    return outcome(403, 'operation-rejected', operationRef);
  }
  const bridge = createStageBridge({
    store,
    sha256,
    deserializeCatalogue: deps.deserializeCatalogue,
    log,
    config: intent.config,
    dataset: intent.dataset,
    stageOperationId: intent.operationId,
    issuedAt: intent.issuedAt,
    randomToken,
    ...core.errorFactories(),
  });
  // The canonical config encoding policy binds how the raw bytes decode.
  const result = await core.stage({
    config: intent.config,
    snapshotBytes: rawBytes,
    encoding: intent.config.parserEncoding,
    ports: bridge.ports,
  });
  const runRef = deriveRef(sha256, 'run', result.runId);
  if (result.status !== 'staged') {
    return outcome(200, 'quarantined', operationRef, {
      runRef,
      summary: {
        status: 'quarantined',
        completenessStatus: result.completenessStatus,
        issueCount: result.issues.length,
      },
    });
  }
  const reviewData = bridge.journal.reviewData;
  return outcome(200, 'staged', operationRef, {
    runRef,
    datasetVersionRef: deriveRef(
      sha256,
      'datasetVersion',
      result.identity.datasetVersionId,
    ),
    summary: {
      status: 'staged',
      completenessStatus: result.completenessStatus,
      approvalRequired: result.approvalRequired,
      largeRemovalRequired: reviewData
        ? reviewData.largeRemovalRequired
        : false,
      issueCount: result.issues.length,
      counts: reviewData ? reviewData.recordCounts : {},
      diff: reviewData ? reviewData.diffSummary : {},
    },
  });
}

/** Load and validate the intent-bound private review, returning null when unavailable or invalid. */
async function loadReview(store, sha256, intent) {
  const fileId = reviewFileId(sha256, {
    stageOperationId: intent.stageOperationId,
    candidateVersionId: intent.candidateVersionId,
    baselineVersionId: intent.baselineVersionId,
    baselineFingerprint: intent.baselineFingerprint,
  });
  let text;
  try {
    text = new TextDecoder().decode(
      await readBytes(await store.downloadFile(BUCKETS.logs, fileId)),
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const parsed = parseReviewDocument(text);
  return parsed.ok ? parsed.review : null;
}

/** Verify review and approval bindings before invoking the publication core. */
async function runPublish(intent, deps, operationRef) {
  const { store, sha256, core, randomToken, log } = deps;
  const configSha256 = sha256.hash(core.canonicalizeConfig(intent.config));
  // The approval originates in the private intent; the review must match it.
  const review = await loadReview(store, sha256, intent);
  if (!review) return outcome(403, 'operation-rejected', operationRef);
  if (!reviewMatchesIntent(intent, review, configSha256)) {
    return outcome(403, 'operation-rejected', operationRef);
  }
  if (
    review.largeRemovalRequired === true &&
    intent.largeRemovalApproval !== true
  ) {
    return outcome(403, 'operation-rejected', operationRef);
  }
  const approval = {
    candidateVersionId: intent.candidateVersionId,
    candidateSha256: intent.candidateSha256,
    configSha256,
    rawSnapshotSha256: intent.rawSnapshotSha256,
    baselineVersionId: intent.baselineVersionId,
    baselineFingerprint: intent.baselineFingerprint,
    approvedBy: intent.approvedBy,
    approvedAt: intent.approvedAt,
    approvalReference: intent.approvalReference,
    largeRemovalApproved: intent.largeRemovalApproval,
    operationalApproval: true,
    largeRemovalRequired: review.largeRemovalRequired,
  };
  const bridge = createPublishBridge({
    store,
    sha256,
    deserializeCatalogue: deps.deserializeCatalogue,
    log,
    config: intent.config,
    dataset: intent.dataset,
    stageOperationId: intent.stageOperationId,
    candidateVersionId: intent.candidateVersionId,
    baselineVersionId: intent.baselineVersionId,
    baselineFingerprint: intent.baselineFingerprint,
    issuedAt: intent.issuedAt,
    // Immutable approval timestamp: a retry must present the same publication.
    publicationTimestamp: intent.approvedAt,
    randomToken,
    ...core.errorFactories(),
  });
  const datasetVersionRef = deriveRef(
    sha256,
    'datasetVersion',
    intent.candidateVersionId,
  );
  let result;
  try {
    result = await core.publish({
      config: intent.config,
      candidateVersionId: intent.candidateVersionId,
      approval,
      ports: bridge.ports,
    });
  } catch (error) {
    if (error instanceof BridgeError && error.code === 'publication-busy') {
      return outcome(409, 'publication-busy', operationRef);
    }
    throw error;
  }
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const summary = {
    status: result.status,
    warnings: warnings.slice(0, 8),
  };
  if (result.status === 'published' || result.status === 'already-published') {
    return outcome(200, result.status, operationRef, {
      datasetVersionRef,
      summary,
    });
  }
  if (result.reason === 'publication-collision') {
    return outcome(409, 'publication-collision', operationRef);
  }
  if (result.reason === 'stale-baseline') {
    return outcome(409, 'stale-baseline', operationRef);
  }
  return outcome(403, 'operation-rejected', operationRef);
}

/**
 * Run one referenced operation. Publication stays disabled unless the trusted
 * flag is exactly true and the private intent carries explicit approval.
 */
export async function runOperation({ operationId, deps }) {
  const { sha256, publishEnabled } = deps;
  const operationRef = deriveRef(sha256, 'operation', operationId);
  if (operationId.startsWith('op-publish-') && publishEnabled !== true) {
    return { status: 403, code: 'publication-disabled' };
  }
  const loaded = await loadIntent(deps.store, sha256, operationId);
  if (loaded.kind === 'unknown') {
    return outcome(404, 'operation-unknown', operationRef);
  }
  if (loaded.kind === 'rejected') {
    return outcome(403, 'operation-rejected', operationRef);
  }
  if (loaded.intent.purpose === PUBLISH_INTENT_PURPOSE) {
    return runPublish(loaded.intent, deps, operationRef);
  }
  return runStage(loaded.intent, deps, operationRef);
}
