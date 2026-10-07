/* global Blob, TextDecoder, TextEncoder */
/**
 * StagePorts/PublishPorts bridge onto the injected Appwrite store.
 *
 * Private artifacts live under deterministic reserved names and are reused on
 * create collision only when every byte and field matches. Public artifacts are
 * create-only: file, descriptor row, then the manifest row last, under one
 * deterministic 36-char public generation identity (the domain stable id is far
 * longer than any Appwrite row id or varchar(64) column). Publication time is
 * pinned to the immutable approval timestamp of the owner intent, never to a
 * wall clock, so a retry presents the identical publication. Writes carry the
 * adapter lease; a lost write response is reported as ambiguity so the core can
 * read-verify the commit point.
 */
import {
  bundleFileId,
  candidateFileId,
  candidateFileName,
  publicationRowId,
  quarantineFileId,
  quarantineFileName,
  REVIEW_PURPOSE,
  reviewFileId,
  reviewFileName,
  runRowId,
  toSafeFileName,
} from './intent.js';
import { safeLog } from './codes.js';
import {
  BUCKETS,
  TABLES,
  TRUSTED_ENDPOINT,
  TRUSTED_PROJECT_ID,
} from './runtime-config.js';

const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
const MAX_ISSUES = 20;
const MAX_ISSUE_CHARS = 240;
const MAX_JSON_CHARS = 8000;
const BASELINE_PAGE_SIZE = 25;
const BASELINE_MAX_PAGES = 4;
const BASELINE_MAX_RECORDS = 100;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const COLLECTION_KEYS = [
  'activeIngredients',
  'atcCodes',
  'dataSources',
  'datasetVersions',
  'dosageForms',
  'manufacturers',
  'marketingAuthorizationHolders',
  'medicationIngredients',
  'products',
  'regulatoryDocuments',
];

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

/** The real Appwrite public download URL of an immutable bundle file. */
export function publicBundleDownloadUrl(fileId) {
  return `${TRUSTED_ENDPOINT}/storage/buckets/${BUCKETS.published}/files/${fileId}/download?project=${TRUSTED_PROJECT_ID}`;
}

function isStoreError(error, code) {
  return (
    error instanceof Error && error.name === 'StoreError' && error.code === code
  );
}

function isNotFound(error) {
  return isStoreError(error, 'NOT_FOUND');
}

function isConflict(error) {
  return isStoreError(error, 'CONFLICT');
}

function isServerFailure(error) {
  return isStoreError(error, 'SERVER_ERROR');
}

function utf8Bytes(text) {
  return new TextEncoder().encode(text);
}

function utf8Text(bytes) {
  return new TextDecoder().decode(bytes);
}

async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function boundedIssues(issues) {
  const list = Array.isArray(issues) ? issues : [];
  return list
    .slice(0, MAX_ISSUES)
    .map((issue) => String(issue).slice(0, MAX_ISSUE_CHARS));
}

function boundedJson(value) {
  const text = JSON.stringify(value);
  return text.length > MAX_JSON_CHARS ? text.slice(0, MAX_JSON_CHARS) : text;
}

function isInstant(value) {
  return (
    typeof value === 'string' &&
    INSTANT_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function assertText(value, max, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new BridgeError('row-invalid', `row ${label} out of bounds`);
  }
}

/** Appwrite SDK `Query` object wire shape: `{ method, attribute, values }`. */
function queryEqual(attribute, value) {
  return JSON.stringify({ method: 'equal', attribute, values: [value] });
}

function queryOrderDesc(attribute) {
  return JSON.stringify({ method: 'orderDesc', attribute });
}

function queryOrderAsc(attribute) {
  return JSON.stringify({ method: 'orderAsc', attribute });
}

function queryLimit(limit) {
  return JSON.stringify({ method: 'limit', values: [limit] });
}

function queryCursorAfter(rowId) {
  return JSON.stringify({ method: 'cursorAfter', values: [rowId] });
}

function rowsOf(list) {
  if (list && Array.isArray(list.rows)) return list.rows;
  throw new BridgeError('invalid-list-response', 'row list shape invalid');
}

function valuesEqual(left, right) {
  if (left === right) return true;
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return false;
  }
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return String(left) === String(right);
}

/** Semantic equality of a stored flat row against the intended column data. */
function rowMatches(existing, data) {
  if (!existing || typeof existing !== 'object') return false;
  for (const [key, value] of Object.entries(data)) {
    if (!valuesEqual(existing[key], value)) return false;
  }
  for (const key of Object.keys(existing)) {
    if (key.startsWith('$')) continue;
    if (!(key in data)) return false;
  }
  return true;
}

function buildRunRow(options) {
  const row = {
    sourceId: options.config.sourceKey,
    snapshotVersion: options.config.sourceVersion,
    importerVersion: options.config.importerVersion,
    startedAt: options.issuedAt,
    counts: boundedJson(options.counts ?? {}),
    validationFailures: boundedJson(boundedIssues(options.issues ?? [])),
    diffSummary: boundedJson(options.diffSummary ?? {}),
    completenessStatus: options.completenessStatus,
    publicationStatus: options.publicationStatus,
  };
  if (options.approvalReference !== undefined) {
    row.approvalReference = options.approvalReference;
  }
  assertText(row.sourceId, 100, 'sourceId');
  assertText(row.snapshotVersion, 200, 'snapshotVersion');
  assertText(row.importerVersion, 50, 'importerVersion');
  if (!isInstant(row.startedAt)) {
    throw new BridgeError('row-invalid', 'run row startedAt invalid');
  }
  assertText(row.completenessStatus, 50, 'completenessStatus');
  assertText(row.publicationStatus, 50, 'publicationStatus');
  if (row.approvalReference !== undefined) {
    assertText(row.approvalReference, 500, 'approvalReference');
  }
  return row;
}

function buildDescriptorRow(descriptor, fileId) {
  const row = {
    datasetVersionId: descriptor.datasetVersionId,
    fileId,
    fileName: descriptor.fileName,
    contentType: descriptor.contentType,
    byteSize: descriptor.byteSize,
    checksum: descriptor.checksum,
  };
  assertText(row.datasetVersionId, 512, 'datasetVersionId');
  assertText(row.fileId, 64, 'fileId');
  assertText(row.fileName, 255, 'fileName');
  assertText(row.contentType, 100, 'contentType');
  assertText(row.checksum, 200, 'checksum');
  if (!Number.isInteger(row.byteSize) || row.byteSize < 0) {
    throw new BridgeError('row-invalid', 'descriptor byteSize invalid');
  }
  return row;
}

function buildManifestRow(manifest) {
  if (!Array.isArray(manifest.sourceIds)) {
    throw new BridgeError('row-invalid', 'manifest sourceIds invalid');
  }
  const row = {
    dataset: manifest.dataset,
    version: manifest.version,
    sourceIds: manifest.sourceIds,
    importedAt: manifest.importedAt,
    checksum: manifest.checksum,
    schemaVersion: manifest.schemaVersion,
    minimumClientVersion: manifest.minimumClientVersion,
    recordCounts: boundedJson(manifest.recordCounts ?? {}),
    coverage: manifest.coverage,
    rightsApprovalReference: manifest.rightsApprovalReference,
    clinicalReviewReference: manifest.clinicalReviewReference,
    status: 'published',
  };
  if (
    manifest.datasetVersionId !== null &&
    manifest.datasetVersionId !== undefined
  ) {
    row.datasetVersionId = manifest.datasetVersionId;
  }
  if (
    manifest.upstreamVersion !== null &&
    manifest.upstreamVersion !== undefined
  ) {
    row.upstreamVersion = manifest.upstreamVersion;
  }
  if (
    manifest.upstreamPublishedAt !== null &&
    manifest.upstreamPublishedAt !== undefined
  ) {
    row.upstreamPublishedAt = manifest.upstreamPublishedAt;
  }
  if (manifest.publishedAt !== null && manifest.publishedAt !== undefined) {
    row.publishedAt = manifest.publishedAt;
  }
  if (
    manifest.previousVersionId !== null &&
    manifest.previousVersionId !== undefined
  ) {
    row.previousVersionId = manifest.previousVersionId;
  }
  assertText(row.dataset, 100, 'dataset');
  assertText(row.version, 100, 'version');
  assertText(row.importedAt, 40, 'importedAt');
  if (!isInstant(row.importedAt)) {
    throw new BridgeError('row-invalid', 'manifest importedAt invalid');
  }
  assertText(row.checksum, 200, 'checksum');
  assertText(row.schemaVersion, 50, 'schemaVersion');
  assertText(row.minimumClientVersion, 50, 'minimumClientVersion');
  assertText(row.rightsApprovalReference, 500, 'rightsApprovalReference');
  assertText(row.clinicalReviewReference, 500, 'clinicalReviewReference');
  if (row.datasetVersionId !== undefined) {
    assertText(row.datasetVersionId, 512, 'datasetVersionId');
  }
  if (row.upstreamVersion !== undefined) {
    assertText(row.upstreamVersion, 200, 'upstreamVersion');
  }
  if (row.previousVersionId !== undefined) {
    assertText(row.previousVersionId, 512, 'previousVersionId');
  }
  for (const sourceId of row.sourceIds) assertText(sourceId, 100, 'sourceId');
  return row;
}

function projectManifestRow(row, fallbackDatasetVersionId) {
  if (!row || typeof row !== 'object' || typeof row.$id !== 'string') {
    throw new BridgeError('row-invalid', 'manifest row invalid');
  }
  let recordCounts;
  try {
    recordCounts = JSON.parse(String(row.recordCounts));
  } catch {
    throw new BridgeError('row-invalid', 'manifest counts invalid');
  }
  const datasetVersionId =
    typeof row.datasetVersionId === 'string' && row.datasetVersionId.length > 0
      ? row.datasetVersionId
      : (fallbackDatasetVersionId ?? row.$id);
  return {
    dataset: row.dataset,
    datasetVersionId,
    version: row.version,
    sourceIds: Array.isArray(row.sourceIds) ? [...row.sourceIds] : [],
    upstreamVersion: row.upstreamVersion ?? null,
    upstreamPublishedAt: row.upstreamPublishedAt ?? null,
    publishedAt: row.publishedAt ?? null,
    importedAt: row.importedAt,
    checksum: row.checksum,
    schemaVersion: row.schemaVersion,
    minimumClientVersion: row.minimumClientVersion,
    recordCounts,
    coverage: row.coverage,
    rightsApprovalReference: row.rightsApprovalReference,
    clinicalReviewReference: row.clinicalReviewReference,
    previousVersionId: row.previousVersionId ?? null,
  };
}

function projectDescriptorRow(row, publicUrl, fallbackDatasetVersionId) {
  if (!row || typeof row !== 'object' || typeof row.$id !== 'string') {
    throw new BridgeError('row-invalid', 'descriptor row invalid');
  }
  const datasetVersionId =
    typeof row.datasetVersionId === 'string' && row.datasetVersionId.length > 0
      ? row.datasetVersionId
      : (fallbackDatasetVersionId ?? row.$id);
  return {
    id: row.$id,
    datasetVersionId,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: Number(row.byteSize),
    checksum: row.checksum,
    url: publicUrl,
  };
}

function parseReviewJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null;
  if (parsed.purpose !== REVIEW_PURPOSE) return null;
  return parsed;
}

function verifyBaselineCounts(recordCounts, catalogue) {
  if (!recordCounts || typeof recordCounts !== 'object') {
    throw new Error('published baseline verification failed');
  }
  for (const [key, value] of Object.entries(recordCounts)) {
    if (!COLLECTION_KEYS.includes(key)) {
      throw new Error('published baseline verification failed');
    }
    const actual = Array.isArray(catalogue[key]) ? catalogue[key].length : -1;
    if (actual !== value) {
      throw new Error('published baseline verification failed');
    }
  }
}

function createSharedPorts(options) {
  const { store, sha256, log, dataset } = options;
  const journal = {
    baseline: { baselineVersionId: null, baselineFingerprint: null },
    reviewData: null,
    writes: [],
  };

  async function createPrivateRowSemantics(tableId, rowId, data) {
    try {
      await store.createPrivateRow(tableId, rowId, data);
      journal.writes.push({ kind: 'row', tableId, rowId });
      return 'created';
    } catch (error) {
      if (!isConflict(error)) throw error;
      const existing = await store.getRow(tableId, rowId);
      if (
        tableId === TABLES.runs &&
        existing &&
        existing.sourceId === data.sourceId &&
        existing.snapshotVersion === data.snapshotVersion &&
        existing.importerVersion === data.importerVersion &&
        existing.completenessStatus === data.completenessStatus
      ) {
        return 'reused';
      }
      if (!rowMatches(existing, data)) {
        throw new BridgeError(
          'private-collision',
          'private create collision with different content',
        );
      }
      return 'reused';
    }
  }

  async function createPrivateFileSemantics(bucketId, fileId, name, bytes) {
    if (bytes.length > MAX_ARTIFACT_BYTES) {
      throw new BridgeError('artifact-too-large', 'artifact exceeds the limit');
    }
    try {
      await store.createPrivateFile(bucketId, fileId, new Blob([bytes]), name);
      journal.writes.push({ kind: 'file', bucketId, fileId });
      return 'created';
    } catch (error) {
      if (!isConflict(error)) throw error;
      const existing = await blobBytes(
        await store.downloadFile(bucketId, fileId),
      );
      if (!sameBytes(existing, bytes)) {
        throw new BridgeError(
          'private-collision',
          'private create collision with different content',
        );
      }
      return 'reused';
    }
  }

  /**
   * Public create-only with typed failure mapping: a genuine 409 is an
   * immutable publication conflict and a lost write response is ambiguous so
   * the core reads the commit point back. No other backend code becomes
   * "already exists".
   */
  async function createPublic(action) {
    try {
      await action();
      journal.writes.push({ kind: 'public' });
    } catch (error) {
      if (isConflict(error)) throw options.newPublicationConflict();
      if (isServerFailure(error)) throw options.newAmbiguousWrite();
      throw error;
    }
  }

  async function listBaselineRows() {
    const collected = [];
    let cursor = null;
    for (let page = 0; page < BASELINE_MAX_PAGES; page += 1) {
      const queries = [
        queryEqual('dataset', dataset),
        queryEqual('status', 'published'),
        queryOrderDesc('publishedAt'),
        queryOrderAsc('$id'),
        queryLimit(BASELINE_PAGE_SIZE),
      ];
      if (cursor !== null) queries.push(queryCursorAfter(cursor));
      const rows = rowsOf(
        await store.listRows(TABLES.publishedVersions, queries),
      );
      collected.push(...rows);
      if (collected.length > BASELINE_MAX_RECORDS) {
        throw new BridgeError(
          'baseline-unbounded',
          'published manifest query exceeded the strict bound',
        );
      }
      if (rows.length < BASELINE_PAGE_SIZE) break;
      const last = rows[rows.length - 1];
      cursor = last && typeof last.$id === 'string' ? last.$id : null;
      if (cursor === null) break;
    }
    return collected;
  }

  function pickNewest(rows) {
    const sorted = rows.slice().sort((left, right) => {
      const leftPublished = String(left.publishedAt ?? '');
      const rightPublished = String(right.publishedAt ?? '');
      if (leftPublished !== rightPublished) {
        return leftPublished < rightPublished ? 1 : -1;
      }
      const leftId = String(left.$id);
      const rightId = String(right.$id);
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
    return sorted[0] ?? null;
  }

  async function readBaseline() {
    const newest = pickNewest(await listBaselineRows());
    if (!newest) {
      journal.baseline = {
        baselineVersionId: null,
        baselineFingerprint: null,
      };
      return { baselineVersionId: null, baselineFingerprint: null };
    }
    const manifest = projectManifestRow(newest);
    const canonicalVersionId = manifest.datasetVersionId;
    const descriptorRows = rowsOf(
      await store.listRows(TABLES.publishedBundles, [
        queryEqual('datasetVersionId', canonicalVersionId),
        queryLimit(1),
      ]),
    );
    const descriptorRow = descriptorRows[0];
    if (!descriptorRow) {
      throw new Error('published baseline verification failed');
    }
    const bytes = await blobBytes(
      await store.downloadFile(BUCKETS.published, descriptorRow.fileId),
    );
    if (manifest.checksum !== `sha256:${sha256.hash(bytes)}`) {
      throw new Error('published baseline verification failed');
    }
    const decoded = options.deserializeCatalogue(utf8Text(bytes));
    if (!decoded || decoded.ok !== true) {
      throw new Error('published baseline verification failed');
    }
    verifyBaselineCounts(manifest.recordCounts, decoded.snapshot);
    journal.baseline = {
      baselineVersionId: canonicalVersionId,
      baselineFingerprint: manifest.checksum,
    };
    return {
      baselineVersionId: canonicalVersionId,
      baselineFingerprint: manifest.checksum,
      recordCounts: manifest.recordCounts,
      catalogue: decoded.snapshot,
    };
  }

  function filteredLog(message) {
    safeLog(log, 'core-log', sha256.hash(String(message)).slice(0, 12));
  }

  return {
    journal,
    createPrivateRowSemantics,
    createPrivateFileSemantics,
    createPublic,
    readBaseline,
    filteredLog,
  };
}

/** Build the StagePorts bridge for one authorized staging operation. */
export function createStageBridge(options) {
  const shared = createSharedPorts(options);
  const { sha256, config, stageOperationId, dataset, issuedAt } = options;
  const { journal } = shared;

  const ports = {
    sha256,
    log: shared.filteredLog,
    readBaseline: shared.readBaseline,
    async writeQuarantine(runId, bytes, reason, issues) {
      void issues;
      await shared.createPrivateFileSemantics(
        BUCKETS.quarantine,
        quarantineFileId(sha256, runId, reason),
        quarantineFileName(reason),
        bytes,
      );
    },
    async writeCandidate(candidateVersionId, bytes) {
      const fileId = candidateFileId(sha256, candidateVersionId);
      await shared.createPrivateFileSemantics(
        BUCKETS.logs,
        fileId,
        candidateFileName(fileId),
        bytes,
      );
    },
    async writeReview(candidateVersionId, reviewData) {
      journal.reviewData = reviewData;
      const reviewId = reviewFileId(sha256, {
        stageOperationId,
        candidateVersionId,
        baselineVersionId: reviewData.baselineVersionId,
        baselineFingerprint: reviewData.baselineFingerprint,
      });
      const document = {
        purpose: REVIEW_PURPOSE,
        stageOperationId,
        dataset,
        ...reviewData,
        issues: boundedIssues(reviewData.issues),
      };
      await shared.createPrivateFileSemantics(
        BUCKETS.logs,
        reviewId,
        reviewFileName(reviewId),
        utf8Bytes(JSON.stringify(document)),
      );
    },
    async writeRunSummary(runId, summary) {
      const reviewData = journal.reviewData;
      await shared.createPrivateRowSemantics(
        TABLES.runs,
        runRowId(sha256, runId),
        buildRunRow({
          config,
          issuedAt,
          completenessStatus: summary.completenessStatus,
          publicationStatus: summary.status,
          counts: reviewData ? reviewData.recordCounts : {},
          diffSummary: reviewData ? reviewData.diffSummary : {},
          issues: summary.issueCodes ?? [],
        }),
      );
    },
  };

  return { ports, journal };
}

/** Build the PublishPorts bridge for one authorized publication. */
export function createPublishBridge(options) {
  const shared = createSharedPorts(options);
  const {
    store,
    sha256,
    randomToken,
    stageOperationId,
    candidateVersionId,
    baselineVersionId,
    baselineFingerprint,
    publicationTimestamp,
  } = options;
  const { journal } = shared;
  function resolvePublicUrl(versionId, fileName) {
    void fileName;
    const targetFileId = bundleFileId(sha256, versionId);
    return publicBundleDownloadUrl(targetFileId);
  }
  const publicBaseUrl = `${TRUSTED_ENDPOINT}/storage/buckets/${BUCKETS.published}/files`;
  let activeLease = null;

  function assertLease(lease) {
    if (typeof lease !== 'string' || lease.length === 0) {
      throw options.newPublicationLease();
    }
    if (activeLease === null || lease !== activeLease) {
      throw options.newPublicationLease();
    }
  }

  async function downloadOrNull(bucketId, wantedFileId) {
    try {
      return await blobBytes(await store.downloadFile(bucketId, wantedFileId));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  const ports = {
    sha256,
    log: shared.filteredLog,
    readBaseline: shared.readBaseline,
    publicationTimestamp,
    resolvePublicUrl,
    publicBaseUrl,
    async readCandidate(versionId) {
      return downloadOrNull(BUCKETS.logs, candidateFileId(sha256, versionId));
    },
    async readReview() {
      const bytes = await downloadOrNull(
        BUCKETS.logs,
        reviewFileId(sha256, {
          stageOperationId,
          candidateVersionId,
          baselineVersionId: baselineVersionId ?? null,
          baselineFingerprint: baselineFingerprint ?? null,
        }),
      );
      if (bytes === null) return null;
      const parsed = parseReviewJson(utf8Text(bytes));
      if (!parsed) {
        throw new BridgeError(
          'review-unreadable',
          'review evidence unreadable',
        );
      }
      return {
        candidateVersionId: parsed.candidateVersionId,
        configSha256: parsed.configSha256,
        rawSnapshotSha256: parsed.rawSnapshotSha256,
        candidateSha256: parsed.candidateSha256,
        baselineVersionId: parsed.baselineVersionId ?? null,
        baselineFingerprint: parsed.baselineFingerprint ?? null,
        completeness: parsed.completeness,
        recordCounts: parsed.recordCounts,
        diffSummary: parsed.diffSummary,
        largeRemovalRequired: parsed.largeRemovalRequired,
        issues: parsed.issues,
      };
    },
    async readPublishedBundleFile(versionId, fileName) {
      void fileName;
      return downloadOrNull(BUCKETS.published, bundleFileId(sha256, versionId));
    },
    async readPublishedDescriptor(versionId) {
      const rows = rowsOf(
        await store.listRows(TABLES.publishedBundles, [
          queryEqual('datasetVersionId', versionId),
          queryLimit(1),
        ]),
      );
      const row = rows[0];
      if (!row) return null;
      return projectDescriptorRow(
        row,
        publicBundleDownloadUrl(row.fileId),
        versionId,
      );
    },
    async readPublishedManifest(versionId) {
      let row = null;
      try {
        row = await store.getRow(
          TABLES.publishedVersions,
          publicationRowId(sha256, versionId),
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      if (row === null) return null;
      return projectManifestRow(row, versionId);
    },
    async acquirePublicationLock() {
      const ownerToken = randomToken();
      const acquired = await store.acquireLock(ownerToken);
      if (!acquired) {
        throw new BridgeError('publication-busy', 'publication lock busy');
      }
      activeLease = ownerToken;
      let released = false;
      return {
        lease: ownerToken,
        release: async () => {
          if (released) return;
          released = true;
          activeLease = null;
          await store.releaseLock(ownerToken);
        },
      };
    },
    async writeBundleFile(lease, versionId, fileName, bytes) {
      assertLease(lease);
      if (bytes.length > MAX_ARTIFACT_BYTES) {
        throw new BridgeError(
          'artifact-too-large',
          'artifact exceeds the limit',
        );
      }
      await shared.createPublic(() =>
        store.publishFile(
          BUCKETS.published,
          bundleFileId(sha256, versionId),
          new Blob([bytes]),
          toSafeFileName(fileName),
        ),
      );
    },
    async writeDescriptorRow(lease, versionId, descriptor) {
      assertLease(lease);
      const row = buildDescriptorRow(
        descriptor,
        bundleFileId(sha256, versionId),
      );
      await shared.createPublic(() =>
        store.publishRow(TABLES.publishedBundles, descriptor.id, row),
      );
    },
    async writeManifestRow(lease, versionId, manifest) {
      assertLease(lease);
      if (manifest.dataset !== options.dataset) {
        throw new BridgeError(
          'dataset-mismatch',
          'manifest dataset outside the trusted synthetic identity',
        );
      }
      const row = buildManifestRow(manifest);
      await shared.createPublic(() =>
        store.publishRow(
          TABLES.publishedVersions,
          publicationRowId(sha256, versionId),
          row,
        ),
      );
    },
  };

  return { ports, journal };
}
