/* global Blob, TextDecoder, TextEncoder */
/**
 * StagePorts/PublishPorts bridge onto the injected Appwrite store.
 *
 * Private artifacts live under deterministic reserved names and are reused on
 * create collision only when every byte and field matches. Public artifacts are
 * create-only: file, descriptor row, then the manifest row last. Nothing here
 * reads request data, and no URL is invented: descriptor rows carry the file id
 * and the only public URL is the real Appwrite download URL of the trusted
 * project.
 */
import {
  bundleFileId,
  candidateFileId,
  candidateFileName,
  quarantineFileId,
  quarantineFileName,
  REVIEW_PURPOSE,
  reviewFileId,
  reviewFileName,
  runRowId,
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
const MAX_ISSUE_CHARS = 300;
const MAX_JSON_CHARS = 8000;
const BASELINE_PAGE_SIZE = 25;
const BASELINE_MAX_PAGES = 4;
const BASELINE_MAX_RECORDS = 100;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const COLLECTION_KEYS = [
  'activeIngredients',
  'atcCodes',
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

/** The only public URL shape used anywhere: the real Appwrite download URL. */
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

function queryEqual(column, value) {
  return JSON.stringify({ method: 'equal', column, values: [value] });
}

function queryOrderDesc(column) {
  return JSON.stringify({ method: 'orderDesc', column });
}

function queryOrderAsc(column) {
  return JSON.stringify({ method: 'orderAsc', column });
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

function buildDescriptorRow(datasetVersionId, descriptor, fileId) {
  const row = {
    datasetVersionId,
    fileId,
    fileName: descriptor.fileName,
    contentType: descriptor.contentType,
    byteSize: descriptor.byteSize,
    checksum: descriptor.checksum,
  };
  assertText(row.datasetVersionId, 64, 'datasetVersionId');
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
  for (const sourceId of row.sourceIds) assertText(sourceId, 100, 'sourceId');
  return row;
}

function projectManifestRow(row) {
  if (!row || typeof row !== 'object' || typeof row.$id !== 'string') {
    throw new BridgeError('row-invalid', 'manifest row invalid');
  }
  let recordCounts;
  try {
    recordCounts = JSON.parse(String(row.recordCounts));
  } catch {
    throw new BridgeError('row-invalid', 'manifest counts invalid');
  }
  return {
    dataset: row.dataset,
    datasetVersionId: row.$id,
    version: row.version,
    sourceIds: Array.isArray(row.sourceIds) ? row.sourceIds : [],
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

function projectDescriptorRow(row) {
  if (!row || typeof row !== 'object' || typeof row.$id !== 'string') {
    throw new BridgeError('row-invalid', 'descriptor row invalid');
  }
  return {
    id: row.$id,
    datasetVersionId: row.datasetVersionId,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: Number(row.byteSize),
    checksum: row.checksum,
    fileId: row.fileId,
    url: publicBundleDownloadUrl(row.fileId),
  };
}

function deserializeIn(options, text) {
  const result = options.deserializeCatalogue(text);
  if (!result || result.ok !== true) {
    throw new Error('published baseline verification failed');
  }
  return result.snapshot;
}

function verifyCounts(recordCounts, catalogue) {
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

function createSharedPorts(options) {
  const { store, sha256, log, dataset } = options;
  const journal = {
    baseline: { baselineVersionId: null, baselineFingerprint: null },
    reviewData: null,
    orphan: null,
    manifestCommitted: false,
    lockReleased: false,
    lockReleaseFailed: false,
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

  async function createPublicRowSemantics(tableId, rowId, data) {
    try {
      await store.publishRow(tableId, rowId, data);
      journal.writes.push({ kind: 'row', tableId, rowId, public: true });
    } catch (error) {
      if (isConflict(error)) throw options.newPublicationConflict();
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
    const rows = await listBaselineRows();
    const newest = pickNewest(rows);
    if (!newest) {
      journal.baseline = { baselineVersionId: null, baselineFingerprint: null };
      return { baselineVersionId: null, baselineFingerprint: null };
    }
    const manifest = projectManifestRow(newest);
    const descriptorRows = rowsOf(
      await store.listRows(TABLES.publishedBundles, [
        queryEqual('datasetVersionId', manifest.datasetVersionId),
        queryLimit(1),
      ]),
    );
    const descriptorRow = descriptorRows[0];
    if (!descriptorRow) {
      throw new Error('published baseline verification failed');
    }
    const descriptor = projectDescriptorRow(descriptorRow);
    const bytes = await blobBytes(
      await store.downloadFile(BUCKETS.published, descriptor.fileId),
    );
    if (manifest.checksum !== `sha256:${sha256.hash(bytes)}`) {
      throw new Error('published baseline verification failed');
    }
    const catalogue = deserializeIn(options, utf8Text(bytes));
    verifyCounts(manifest.recordCounts, catalogue);
    journal.baseline = {
      baselineVersionId: manifest.datasetVersionId,
      baselineFingerprint: manifest.checksum,
    };
    return {
      baselineVersionId: manifest.datasetVersionId,
      baselineFingerprint: manifest.checksum,
      recordCounts: manifest.recordCounts,
      catalogue,
    };
  }

  function filteredLog(message) {
    safeLog(log, 'core-log', sha256.hash(String(message)).slice(0, 12));
  }

  return {
    journal,
    createPrivateRowSemantics,
    createPrivateFileSemantics,
    createPublicRowSemantics,
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
      await shared.createPrivateFileSemantics(
        BUCKETS.quarantine,
        quarantineFileId(sha256, runId, reason),
        quarantineFileName(reason),
        bytes,
      );
      await shared.createPrivateRowSemantics(
        TABLES.runs,
        runRowId(sha256, runId),
        buildRunRow({
          config,
          issuedAt,
          completenessStatus: reason,
          publicationStatus: 'quarantined',
          counts: {},
          diffSummary: { reason, issueCount: issues.length },
          issues,
        }),
      );
    },
    async writeCandidate(candidateVersionId, bytes) {
      await shared.createPrivateFileSemantics(
        BUCKETS.logs,
        candidateFileId(sha256, candidateVersionId),
        candidateFileName(candidateVersionId),
        bytes,
      );
    },
    async writeReview(candidateVersionId, reviewData) {
      journal.reviewData = reviewData;
      const baseline = journal.baseline ?? {
        baselineVersionId: null,
        baselineFingerprint: null,
      };
      const document = {
        purpose: REVIEW_PURPOSE,
        stageOperationId,
        dataset,
        candidateVersionId,
        baselineVersionId: baseline.baselineVersionId ?? null,
        baselineFingerprint: baseline.baselineFingerprint ?? null,
        configSha256: reviewData.configSha256,
        rawSnapshotSha256: reviewData.rawSnapshotSha256,
        candidateSha256: reviewData.candidateSha256,
        diffSummary: reviewData.diffSummary,
        largeRemovalRequired: reviewData.largeRemovalRequired,
        issues: boundedIssues(reviewData.issues),
      };
      await shared.createPrivateFileSemantics(
        BUCKETS.logs,
        reviewFileId(sha256, {
          stageOperationId,
          candidateVersionId,
          baselineVersionId: baseline.baselineVersionId ?? null,
          baselineFingerprint: baseline.baselineFingerprint ?? null,
        }),
        reviewFileName(candidateVersionId),
        utf8Bytes(JSON.stringify(document)),
      );
    },
    async writeRunSummary(runId, summary) {
      const reviewData = summary.reviewData ?? null;
      if (reviewData) journal.reviewData = reviewData;
      await shared.createPrivateRowSemantics(
        TABLES.runs,
        runRowId(sha256, runId),
        buildRunRow({
          config,
          issuedAt,
          completenessStatus: reviewData ? 'complete' : 'incomplete',
          publicationStatus: summary.status,
          counts: reviewData ? reviewData.diffSummary : {},
          diffSummary: {
            status: summary.status,
            datasetVersionId: summary.datasetVersionId ?? '',
            largeRemovalRequired: reviewData
              ? reviewData.largeRemovalRequired
              : false,
            issueCount: reviewData ? reviewData.issues.length : 0,
          },
          issues: reviewData ? reviewData.issues : [],
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
    now,
    randomToken,
    stageOperationId,
    candidateVersionId,
    baselineVersionId,
    baselineFingerprint,
  } = options;
  const { journal } = shared;

  async function downloadOrNull(bucketId, fileId) {
    try {
      return await blobBytes(await store.downloadFile(bucketId, fileId));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  const ports = {
    sha256,
    log: shared.filteredLog,
    readBaseline: shared.readBaseline,
    publicationTimestamp: now().toISOString(),
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
        configSha256: parsed.configSha256,
        rawSnapshotSha256: parsed.rawSnapshotSha256,
        candidateSha256: parsed.candidateSha256,
        diffSummary: parsed.diffSummary,
        largeRemovalRequired: parsed.largeRemovalRequired,
        issues: parsed.issues,
      };
    },
    async readPublished() {
      const bytes = await downloadOrNull(
        BUCKETS.published,
        bundleFileId(sha256, candidateVersionId),
      );
      const descriptorRows = rowsOf(
        await store.listRows(TABLES.publishedBundles, [
          queryEqual('datasetVersionId', candidateVersionId),
          queryLimit(1),
        ]),
      );
      const descriptorRow = descriptorRows[0] ?? null;
      let manifestRow = null;
      try {
        manifestRow = await store.getRow(
          TABLES.publishedVersions,
          candidateVersionId,
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      journal.orphan = {
        filePresent: bytes !== null,
        fileSha256: bytes !== null ? sha256.hash(bytes) : '',
        descriptorPresent: descriptorRow !== null,
        manifestPresent: manifestRow !== null,
      };
      if (bytes === null || descriptorRow === null || manifestRow === null) {
        return null;
      }
      return {
        bytes,
        descriptor: projectDescriptorRow(descriptorRow),
        manifest: projectManifestRow(manifestRow),
      };
    },
    async acquirePublicationLock() {
      const ownerToken = randomToken();
      const acquired = await store.acquireLock(ownerToken);
      if (!acquired) {
        throw new BridgeError('publication-busy', 'publication lock busy');
      }
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          try {
            await store.releaseLock(ownerToken);
            journal.lockReleased = true;
          } catch (error) {
            if (!journal.manifestCommitted) throw error;
            journal.lockReleaseFailed = true;
            safeLog(options.log, 'lock-release-failed', 'none');
          }
        },
      };
    },
    async writeBundleFile(versionId, fileName, bytes) {
      if (bytes.length > MAX_ARTIFACT_BYTES) {
        throw new BridgeError(
          'artifact-too-large',
          'artifact exceeds the limit',
        );
      }
      try {
        await store.publishFile(
          BUCKETS.published,
          bundleFileId(sha256, versionId),
          new Blob([bytes]),
          fileName,
        );
        journal.writes.push({
          kind: 'file',
          bucketId: BUCKETS.published,
          public: true,
        });
      } catch (error) {
        if (isConflict(error)) throw options.newPublicationConflict();
        throw error;
      }
    },
    async writeDescriptorRow(versionId, descriptor) {
      const row = buildDescriptorRow(
        versionId,
        descriptor,
        bundleFileId(sha256, versionId),
      );
      await shared.createPublicRowSemantics(
        TABLES.publishedBundles,
        descriptor.id,
        row,
      );
    },
    async writeManifestRow(versionId, manifest) {
      if (manifest.dataset !== options.dataset) {
        throw new BridgeError(
          'dataset-mismatch',
          'manifest dataset outside the trusted synthetic identity',
        );
      }
      const row = buildManifestRow(manifest);
      await shared.createPublicRowSemantics(
        TABLES.publishedVersions,
        versionId,
        row,
      );
      journal.manifestCommitted = true;
    },
  };

  return { ports, journal };
}
