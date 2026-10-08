/**
 * Owner-created private operation intents and handler-created evidence.
 *
 * Every document lives in the private `import-run-logs` bucket under a fixed
 * reserved file-name prefix and a strict purpose-bound schema. Identifiers are
 * derived deterministically with purpose-separated salts, so a candidate,
 * review, raw snapshot or run row can never collide with an approval intent.
 * Field bounds mirror the Appwrite columns of the config as code: version 100,
 * schema/minimum 50, sourceId 100, importer 50, approval references 500.
 */

export const STAGE_INTENT_PURPOSE = 'intermed-synthetic-stage/v1';
export const PUBLISH_INTENT_PURPOSE = 'intermed-synthetic-publish/v1';
export const REVIEW_PURPOSE = 'intermed-stage-review/v1';

export const INTENT_FILE_NAME_PREFIX = 'op-intent-v1.';
export const CANDIDATE_FILE_NAME_PREFIX = 'candidate-v1.';
export const REVIEW_FILE_NAME_PREFIX = 'stage-review-v1.';
export const QUARANTINE_FILE_NAME_PREFIX = 'quarantine-v1.';

const ID_LIMIT = 36;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/;
const OPERATION_PATTERN = /^op-(stage|publish)-[a-z0-9][a-z0-9-]{0,43}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const PARSER_ENCODINGS = ['utf-8', 'utf8', 'windows-1250'];
/**
 * Optional bounded quarantine reason token, exactly as `stage` emits it for a
 * real large-removal generation ('large-removal'): one lowercase code token,
 * never free text. Any other value keeps the document rejected.
 */
const QUARANTINE_REASON_PATTERN = /^[a-z][a-z0-9-]{0,49}$/;

/** Accept non-null objects except arrays for document validation. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Check that the document has exactly the expected enumerable keys. */
function hasExactKeys(value, expected) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length && expected.every((key) => key in value)
  );
}

/** Check string length against inclusive minimum and maximum bounds. */
function isBoundedString(value, min, max) {
  return (
    typeof value === 'string' && value.length >= min && value.length <= max
  );
}

/** Require a bounded record key without whitespace or control characters. */
function isRecordKey(value, max) {
  if (!isBoundedString(value, 1, max)) return false;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x1f || code === 0x7f) return false;
    if (/\s/u.test(char)) return false;
  }
  return true;
}

/** Check the length and character policy for physical Appwrite identifiers. */
function isSafeId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= ID_LIMIT &&
    ID_PATTERN.test(value)
  );
}

/** Accept bounded canonical version IDs, permitting the domain unit separator. */
function isVersionId(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 512) return false;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) return false;
    if (code < 0x20 && code !== 0x1f) return false;
    if (code === 0x7f) return false;
  }
  return true;
}

/** Check for a parseable UTC timestamp in the supported precision range. */
function isInstant(value) {
  return (
    typeof value === 'string' &&
    INSTANT_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** Accept nonnegative integer record counts. */
function isCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const RECORD_COUNT_KEYS = [
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

/** Require all canonical collection counts and reject unknown count keys. */
function isRecordCounts(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === RECORD_COUNT_KEYS.length &&
    RECORD_COUNT_KEYS.every((key, index) => keys[index] === key) &&
    Object.values(value).every((count) => isCount(count))
  );
}

/** Validate the exact intent configuration schema, bounds and synthetic allowlist. */
function validateConfig(config) {
  if (!isPlainObject(config)) return false;
  if (
    !hasExactKeys(config, [
      'importerVersion',
      'largeRemovalCount',
      'largeRemovalPercent',
      'maxRawBytes',
      'maxRows',
      'parserEncoding',
      'parserVersion',
      'schemaVersion',
      'sourceKey',
      'sourceVersion',
      'syntheticAllowlist',
    ])
  ) {
    return false;
  }
  if (!isRecordKey(config.sourceKey, 100)) return false;
  if (!isBoundedString(config.sourceVersion, 1, 200)) return false;
  if (!isBoundedString(config.schemaVersion, 1, 50)) return false;
  if (!isBoundedString(config.importerVersion, 1, 50)) return false;
  if (!isBoundedString(config.parserVersion, 1, 50)) return false;
  if (!PARSER_ENCODINGS.includes(config.parserEncoding)) return false;
  if (!Array.isArray(config.syntheticAllowlist)) return false;
  if (config.syntheticAllowlist.length < 1) return false;
  if (config.syntheticAllowlist.length > 20) return false;
  if (!config.syntheticAllowlist.every((key) => isRecordKey(key, 100))) {
    return false;
  }
  const lowered = config.syntheticAllowlist.map((key) => key.toLowerCase());
  if (new Set(lowered).size !== lowered.length) return false;
  // Explicit synthetic identity: the source must be on its own allowlist.
  if (!lowered.includes(config.sourceKey.toLowerCase())) return false;
  if (
    typeof config.largeRemovalCount !== 'number' ||
    !Number.isInteger(config.largeRemovalCount) ||
    config.largeRemovalCount < 1 ||
    config.largeRemovalCount > 1000000
  ) {
    return false;
  }
  if (
    typeof config.largeRemovalPercent !== 'number' ||
    config.largeRemovalPercent < 0 ||
    config.largeRemovalPercent > 100
  ) {
    return false;
  }
  if (
    typeof config.maxRawBytes !== 'number' ||
    !Number.isInteger(config.maxRawBytes) ||
    config.maxRawBytes < 1 ||
    config.maxRawBytes > 5242880
  ) {
    return false;
  }
  if (
    typeof config.maxRows !== 'number' ||
    !Number.isInteger(config.maxRows) ||
    config.maxRows < 1 ||
    config.maxRows > 1000000
  ) {
    return false;
  }
  return true;
}

/** Parse a JSON object; return null for non-text, invalid JSON or other shapes. */
function parseJson(text) {
  if (typeof text !== 'string') return null;
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Exact review keys; the bounded quarantine reason is the only optionality. */
const REVIEW_KEYS = [
  'baselineFingerprint',
  'baselineVersionId',
  'candidateSha256',
  'candidateVersionId',
  'completeness',
  'configSha256',
  'dataset',
  'diffSummary',
  'issues',
  'largeRemovalRequired',
  'purpose',
  'rawSnapshotSha256',
  'recordCounts',
  'stageOperationId',
];

function hasReviewKeys(review) {
  const keys = Object.keys(review);
  if (keys.length === REVIEW_KEYS.length) {
    return REVIEW_KEYS.every((key) => key in review);
  }
  if (keys.length === REVIEW_KEYS.length + 1 && 'quarantineReason' in review) {
    return (
      REVIEW_KEYS.every((key) => key in review) &&
      typeof review.quarantineReason === 'string' &&
      QUARANTINE_REASON_PATTERN.test(review.quarantineReason)
    );
  }
  return false;
}

/** Validate a synthetic stage intent and its raw-file and configuration bindings. */
function validateStageIntent(intent) {
  if (
    !hasExactKeys(intent, [
      'config',
      'dataset',
      'issuedAt',
      'operationId',
      'purpose',
      'rawSnapshotFileId',
      'rawSnapshotSha256',
      'syntheticOnly',
    ])
  ) {
    return false;
  }
  if (intent.purpose !== STAGE_INTENT_PURPOSE) return false;
  if (!OPERATION_PATTERN.test(intent.operationId)) return false;
  if (!intent.operationId.startsWith('op-stage-')) return false;
  if (!isInstant(intent.issuedAt)) return false;
  if (!isRecordKey(intent.dataset, 100)) return false;
  if (intent.syntheticOnly !== true) return false;
  if (!isSafeId(intent.rawSnapshotFileId)) return false;
  if (!SHA256_PATTERN.test(intent.rawSnapshotSha256)) return false;
  return validateConfig(intent.config);
}

/** Validate publication bindings and explicit operator approval fields. */
function validatePublishIntent(intent) {
  if (
    !hasExactKeys(intent, [
      'approvedAt',
      'approvedBy',
      'approvalReference',
      'baselineFingerprint',
      'baselineVersionId',
      'candidateSha256',
      'candidateVersionId',
      'config',
      'dataset',
      'issuedAt',
      'largeRemovalApproval',
      'operationalApproval',
      'operationId',
      'purpose',
      'rawSnapshotSha256',
      'stageOperationId',
      'version',
    ])
  ) {
    return false;
  }
  if (intent.purpose !== PUBLISH_INTENT_PURPOSE) return false;
  if (!OPERATION_PATTERN.test(intent.operationId)) return false;
  if (!intent.operationId.startsWith('op-publish-')) return false;
  if (!isInstant(intent.issuedAt)) return false;
  if (!isRecordKey(intent.dataset, 100)) return false;
  if (!OPERATION_PATTERN.test(intent.stageOperationId)) return false;
  if (!intent.stageOperationId.startsWith('op-stage-')) return false;
  if (!isVersionId(intent.candidateVersionId)) return false;
  if (!SHA256_PATTERN.test(intent.candidateSha256)) return false;
  if (!SHA256_PATTERN.test(intent.rawSnapshotSha256)) return false;
  if (
    intent.baselineVersionId !== null &&
    !isVersionId(intent.baselineVersionId)
  ) {
    return false;
  }
  if (
    intent.baselineFingerprint !== null &&
    (typeof intent.baselineFingerprint !== 'string' ||
      !FINGERPRINT_PATTERN.test(intent.baselineFingerprint))
  ) {
    return false;
  }
  if (
    (intent.baselineVersionId === null) !==
    (intent.baselineFingerprint === null)
  ) {
    return false;
  }
  if (!isRecordKey(intent.version, 100)) return false;
  // Explicit human approval triple: actor, reference and timestamp. The
  // timestamp also pins the publication time so retries never drift.
  if (!isBoundedString(intent.approvedBy, 1, 200)) return false;
  if (intent.approvedBy.trim().length === 0) return false;
  if (!isBoundedString(intent.approvalReference, 1, 500)) return false;
  if (intent.approvalReference.trim().length === 0) return false;
  if (!isInstant(intent.approvedAt)) return false;
  if (intent.operationalApproval !== true) return false;
  if (typeof intent.largeRemovalApproval !== 'boolean') return false;
  return validateConfig(intent.config);
}

/** Parse a private intent document strictly by purpose. */
export function parseIntentDocument(text) {
  const intent = parseJson(text);
  if (!intent) return { ok: false };
  if (intent.purpose === STAGE_INTENT_PURPOSE) {
    return validateStageIntent(intent) ? { ok: true, intent } : { ok: false };
  }
  if (intent.purpose === PUBLISH_INTENT_PURPOSE) {
    return validatePublishIntent(intent) ? { ok: true, intent } : { ok: false };
  }
  return { ok: false };
}

/** Parse a private stage review document; approval intents are rejected. */
export function parseReviewDocument(text) {
  const review = parseJson(text);
  if (!review) return { ok: false };
  if (!hasReviewKeys(review)) return { ok: false };
  if (review.purpose !== REVIEW_PURPOSE) return { ok: false };
  if (!OPERATION_PATTERN.test(review.stageOperationId)) return { ok: false };
  if (!isRecordKey(review.dataset, 100)) return { ok: false };
  if (!isVersionId(review.candidateVersionId)) return { ok: false };
  if (
    review.baselineVersionId !== null &&
    !isVersionId(review.baselineVersionId)
  ) {
    return { ok: false };
  }
  if (
    review.baselineFingerprint !== null &&
    (typeof review.baselineFingerprint !== 'string' ||
      !FINGERPRINT_PATTERN.test(review.baselineFingerprint))
  ) {
    return { ok: false };
  }
  if (!SHA256_PATTERN.test(review.configSha256)) return { ok: false };
  if (!SHA256_PATTERN.test(review.rawSnapshotSha256)) return { ok: false };
  if (!SHA256_PATTERN.test(review.candidateSha256)) return { ok: false };
  if (review.completeness !== 'complete') return { ok: false };
  if (!isRecordCounts(review.recordCounts)) return { ok: false };
  if (typeof review.largeRemovalRequired !== 'boolean') return { ok: false };
  const diff = review.diffSummary;
  if (
    !isPlainObject(diff) ||
    !hasExactKeys(diff, [
      'added',
      'changed',
      'netProducts',
      'removed',
      'renamed',
    ]) ||
    !Object.values(diff).every((value) => isCount(value))
  ) {
    return { ok: false };
  }
  if (!Array.isArray(review.issues)) return { ok: false };
  if (review.issues.length > 50) return { ok: false };
  if (!review.issues.every((issue) => isBoundedString(issue, 0, 300))) {
    return { ok: false };
  }
  return { ok: true, review };
}

/**
 * Bind a private stage review to the publish intent that references it. The
 * recomputed canonical config hash is supplied by the caller so the review can
 * never be matched against a different configuration.
 */
export function reviewMatchesIntent(intent, review, configSha256) {
  if (!isPlainObject(intent) || !isPlainObject(review)) return false;
  return (
    review.purpose === REVIEW_PURPOSE &&
    review.stageOperationId === intent.stageOperationId &&
    review.dataset === intent.dataset &&
    review.candidateVersionId === intent.candidateVersionId &&
    review.baselineVersionId === (intent.baselineVersionId ?? null) &&
    review.baselineFingerprint === (intent.baselineFingerprint ?? null) &&
    review.configSha256 === configSha256 &&
    review.rawSnapshotSha256 === intent.rawSnapshotSha256 &&
    review.candidateSha256 === intent.candidateSha256 &&
    review.completeness === 'complete'
  );
}

/** The intent purpose must agree with the reserved reference prefix. */
export function intentMatchesOperation(intent, operationId) {
  if (!isPlainObject(intent)) return false;
  if (intent.operationId !== operationId) return false;
  if (intent.purpose === STAGE_INTENT_PURPOSE) {
    return operationId.startsWith('op-stage-');
  }
  if (intent.purpose === PUBLISH_INTENT_PURPOSE) {
    return operationId.startsWith('op-publish-');
  }
  return false;
}

/** Combine a purpose prefix with 32 digest characters for a physical storage ID. */
function deriveId(sha256, prefix, material) {
  return `${prefix}${sha256.hash(material).slice(0, 32)}`;
}

/** Derive the private intent file ID from its operation reference. */
export function intentFileId(sha256, operationId) {
  return deriveId(sha256, 'oid1', `intermed-op-intent-file/v1|${operationId}`);
}

/** Build the reserved JSON filename for an operation intent. */
export function intentFileName(operationId) {
  return `${INTENT_FILE_NAME_PREFIX}${operationId}.json`;
}

/** Require the exact reserved filename for the referenced operation. */
export function isReservedIntentFileName(name, operationId) {
  return name === intentFileName(operationId);
}

/** Derive a private candidate file ID from the canonical generation ID. */
export function candidateFileId(sha256, candidateVersionId) {
  return deriveId(
    sha256,
    'cnd1',
    `intermed-candidate-file/v1|${candidateVersionId}`,
  );
}

/** File names embed only derived ids, never raw domain ids. */
export function candidateFileName(fileId) {
  return `${CANDIDATE_FILE_NAME_PREFIX}${fileId}.json`;
}

/** Derive a review file ID bound to the stage, candidate and baseline fingerprint. */
export function reviewFileId(sha256, binding) {
  const material = [
    'intermed-stage-review-file/v1',
    binding.stageOperationId,
    binding.candidateVersionId,
    binding.baselineVersionId ?? 'none',
    binding.baselineFingerprint ?? 'none',
  ].join('|');
  return deriveId(sha256, 'rev1', material);
}

/** Build the reserved JSON filename for a derived review file ID. */
export function reviewFileName(fileId) {
  return `${REVIEW_FILE_NAME_PREFIX}${fileId}.json`;
}

/** Derive a quarantine file ID bound to the run and rejection reason. */
export function quarantineFileId(sha256, runId, reason) {
  return deriveId(
    sha256,
    'qtn1',
    `intermed-quarantine-file/v1|${runId}|${reason}`,
  );
}

/** Build the reserved raw filename for a quarantine reason code. */
export function quarantineFileName(reason) {
  return `${QUARANTINE_FILE_NAME_PREFIX}${reason}.raw`;
}

/** Derive the private run-summary row ID from its run identity. */
export function runRowId(sha256, runId) {
  return deriveId(sha256, 'run1', `intermed-run-row/v1|${runId}`);
}

/** Derive the public bundle file ID from the canonical candidate identity. */
export function bundleFileId(sha256, candidateVersionId) {
  return deriveId(
    sha256,
    'bnd1',
    `intermed-bundle-file/v1|${candidateVersionId}`,
  );
}

/**
 * Storage-safe form of a file name: domain stable ids carry unit separators,
 * which multipart headers and Storage names must never contain. The mapping is
 * deterministic so retries address the same stored file.
 */
export function toSafeFileName(fileName) {
  const raw = String(fileName);
  let safe = '';
  for (const char of raw) {
    const code = char.codePointAt(0);
    safe += code !== undefined && code <= 0x1f ? '_' : char;
  }
  const trimmed = safe.replace(/\u007f/g, '_');
  return trimmed.length > 0 && trimmed.length <= 255 ? trimmed : 'bundle.json';
}

/**
 * Public generation identity for physical Appwrite manifest rows. The
 * deterministic 36-char derivation is used for physical manifest row $id
 * only; canonical descriptor.datasetVersionId and previousVersionId lineage
 * links use 512 field capacity (separate live migration prerequisite, not
 * executed).
 */
export function publicationRowId(sha256, datasetVersionId) {
  return deriveId(
    sha256,
    'gen1',
    `intermed-publication-row/v1|${datasetVersionId}`,
  );
}
