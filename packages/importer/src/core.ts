import type {
  DatasetRecordCounts,
  MedicationCatalogueSnapshot,
  PublishedBundleDescriptor,
  PublishedDatasetManifest,
} from '@intermed/domain';
import { canonicalEncodingName } from './parser';

export type ImportMode = 'stage' | 'publish';

export interface CanonicalImporterConfig {
  sourceKey: string;
  sourceVersion: string;
  schemaVersion: string;
  importerVersion: string;
  parserVersion: string;
  /**
   * Canonical parser encoding policy. It is part of the canonical config and
   * therefore of the generation identity: the same bytes under the same config
   * can never decode differently. A request presenting a different encoding is
   * quarantined before parsing.
   */
  parserEncoding: string;
  syntheticAllowlist: readonly string[];
  largeRemovalCount: number;
  largeRemovalPercent: number;
  maxRawBytes: number;
  maxRows: number;
}

export interface ImportIdentity {
  /** Real `snapshot.datasetVersions[0].id` of the sealed candidate. */
  datasetVersionId: string;
  /** Generation version key derived only from the raw SHA and the config. */
  generationVersionKey: string;
  configSha256: string;
  snapshotSha256: string;
  candidateSha256: string;
}

/** Serialize configuration in stable field order with canonical encoding and sorted allowlist. */
export function canonicalizeConfig(config: CanonicalImporterConfig): string {
  return JSON.stringify({
    importerVersion: config.importerVersion,
    largeRemovalCount: config.largeRemovalCount,
    largeRemovalPercent: config.largeRemovalPercent,
    maxRawBytes: config.maxRawBytes,
    maxRows: config.maxRows,
    parserEncoding:
      canonicalEncodingName(config.parserEncoding) ?? 'unsupported',
    parserVersion: config.parserVersion,
    schemaVersion: config.schemaVersion,
    sourceKey: config.sourceKey,
    sourceVersion: config.sourceVersion,
    syntheticAllowlist: [...config.syntheticAllowlist].sort(),
  });
}

/**
 * Return issue codes for invalid configuration, or an empty list when valid.
 * Count and byte bounds must be finite integers; the removal percentage may be
 * fractional within 0–100. Key fields must be trimmed and free of controls.
 */
export function configIssues(config: CanonicalImporterConfig): string[] {
  const issues: string[] = [];
  const requireKey = (name: string, value: string): void => {
    if (
      typeof value !== 'string' ||
      value.trim() === '' ||
      value !== value.trim() ||
      hasControlCharacter(value)
    ) {
      issues.push(`config:${name}`);
    }
  };
  const requireInteger = (
    name: string,
    value: number,
    min: number,
    max: number,
  ): void => {
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    ) {
      issues.push(`config:${name}`);
    }
  };
  requireKey('sourceKey', config.sourceKey);
  requireKey('sourceVersion', config.sourceVersion);
  requireKey('schemaVersion', config.schemaVersion);
  requireKey('importerVersion', config.importerVersion);
  requireKey('parserVersion', config.parserVersion);
  if (canonicalEncodingName(config.parserEncoding) === null) {
    issues.push('config:parserEncoding');
  }
  if (
    !Array.isArray(config.syntheticAllowlist) ||
    config.syntheticAllowlist.length === 0 ||
    config.syntheticAllowlist.some((entry) => !entry || !entry.trim())
  ) {
    issues.push('config:syntheticAllowlist');
  }
  requireInteger('largeRemovalCount', config.largeRemovalCount, 1, 1_000_000);
  requireInteger('maxRawBytes', config.maxRawBytes, 1, Number.MAX_SAFE_INTEGER);
  requireInteger('maxRows', config.maxRows, 1, 1_000_000);
  if (
    !Number.isFinite(config.largeRemovalPercent) ||
    config.largeRemovalPercent < 0 ||
    config.largeRemovalPercent > 100
  ) {
    issues.push('config:largeRemovalPercent');
  }
  return issues;
}

/** Detect ASCII control characters and DEL in identity or URL text. */
export function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Thrown when the importer config is not finite, bounded, or usable. */
export class ImporterConfigError extends Error {
  readonly code = 'invalid-config';
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Importer config rejected: ${issues.join(', ')}`);
    this.name = 'ImporterConfigError';
    this.issues = issues;
  }
}

/** Throw ImporterConfigError when configuration validation reports any issues. */
export function assertValidConfig(config: CanonicalImporterConfig): void {
  const issues = configIssues(config);
  if (issues.length > 0) throw new ImporterConfigError(issues);
}

/**
 * Adapter-thrown when an immutable public object already exists. Identity of
 * this condition is the typed class or its stable code, never a message match.
 */
export class PublicationConflictError extends Error {
  readonly code = 'already-exists';

  constructor() {
    super('The immutable publication object already exists');
    this.name = 'PublicationConflictError';
  }
}

/**
 * Adapter-thrown when a write may have been applied but its response was lost.
 * Core must read-verify the commit point instead of assuming the prior state.
 */
export class AmbiguousWriteError extends Error {
  readonly code = 'ambiguous-write';

  constructor() {
    super('The write result is unknown and must be read back');
    this.name = 'AmbiguousWriteError';
  }
}

/** Thrown when the publication lock did not hand out a usable lease. */
export class PublicationLeaseError extends Error {
  readonly code = 'invalid-lease';

  constructor() {
    super('The publication lock lease is missing or empty');
    this.name = 'PublicationLeaseError';
  }
}

/** Extract an error-like object code without relying on its message. */
function errorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return (error as { code: unknown }).code;
}

/** Typed conflict check. Errors are classified by code, never by message. */
export function isPublicationConflict(error: unknown): boolean {
  return (
    error instanceof PublicationConflictError ||
    errorCode(error) === 'already-exists'
  );
}

/** Typed ambiguity check. Errors are classified by code, never by message. */
export function isAmbiguousWrite(error: unknown): boolean {
  return (
    error instanceof AmbiguousWriteError ||
    errorCode(error) === 'ambiguous-write'
  );
}

export interface BaselineBinding {
  baselineVersionId: string | null;
  baselineFingerprint: string | null;
  recordCounts?: Record<string, number>;
  catalogue?: MedicationCatalogueSnapshot;
}

export interface ReviewApproval extends BaselineBinding {
  candidateVersionId: string;
  candidateSha256: string;
  configSha256: string;
  rawSnapshotSha256: string;
  approvedBy: string;
  approvedAt: string;
  approvalReference: string;
  largeRemovalApproved: boolean;
  operationalApproval?: boolean;
  largeRemovalRequired?: boolean;
}

export interface DiffSummary {
  added: number;
  changed: number;
  renamed: number;
  removed: number;
  netProducts: number;
}

/**
 * Typed private review written by `stage` and verified in full by `publish`.
 * It binds config, raw snapshot, candidate and baseline and states that the
 * candidate is complete. It carries hashes, counts and codes only: no source
 * text and no backend detail.
 */
export interface ReviewData {
  candidateVersionId: string;
  configSha256: string;
  rawSnapshotSha256: string;
  candidateSha256: string;
  baselineVersionId: string | null;
  baselineFingerprint: string | null;
  completeness: 'complete';
  recordCounts: DatasetRecordCounts;
  diffSummary: DiffSummary;
  largeRemovalRequired: boolean;
  quarantineReason?: string;
  issues: string[];
}

/** Bounded private run record. Codes and counts only, never source text. */
export interface RunSummary {
  runId: string;
  status: 'staged' | 'quarantined';
  completenessStatus: string;
  datasetVersionId?: string;
  issueCodes: string[];
  largeRemovalRequired?: boolean;
}

export interface StageResult {
  runId: string;
  identity: ImportIdentity;
  status: 'staged' | 'quarantined';
  completenessStatus: string;
  diffSummary: string;
  approvalRequired: boolean;
  issues: string[];
}

export interface SHA256Port {
  hash(data: Uint8Array | string): string;
}

/** Lease handle for one publication attempt. Ownership stays adapter-side. */
export interface PublicationLock {
  /** Non-empty adapter lease token identifying this attempt. */
  lease: string;
  release(): Promise<void> | void;
}

export interface StagePorts {
  sha256: SHA256Port;
  log: (msg: string) => void;
  readBaseline: () => Promise<BaselineBinding>;
  readRawSnapshot?: () => Promise<Uint8Array>;
  writeQuarantine: (
    runId: string,
    bytes: Uint8Array,
    reason: string,
    issues: string[],
  ) => Promise<void>;
  writeCandidate: (
    candidateVersionId: string,
    bytes: Uint8Array,
  ) => Promise<void>;
  writeReview: (
    candidateVersionId: string,
    reviewData: ReviewData,
  ) => Promise<void>;
  writeRunSummary: (runId: string, summary: RunSummary) => Promise<void>;
}

export interface PublishPorts {
  sha256: SHA256Port;
  log: (msg: string) => void;
  readCandidate: (candidateVersionId: string) => Promise<Uint8Array | null>;
  readBaseline: () => Promise<BaselineBinding>;
  readReview: (candidateVersionId: string) => Promise<ReviewData | null>;
  acquirePublicationLock: () => Promise<PublicationLock>;
  /** Component read port: the immutable public bundle file, if it exists. */
  readPublishedBundleFile: (
    datasetVersionId: string,
    fileName: string,
  ) => Promise<Uint8Array | null>;
  /** Component read port: the descriptor row, if it exists. */
  readPublishedDescriptor: (
    datasetVersionId: string,
  ) => Promise<PublishedBundleDescriptor | null>;
  /** Component read port: the manifest row, if it exists. */
  readPublishedManifest: (
    datasetVersionId: string,
  ) => Promise<PublishedDatasetManifest | null>;
  publicBaseUrl?: string;
  resolvePublicUrl?: (datasetVersionId: string, fileName: string) => string;
  publicationTimestamp?: string;
  writeBundleFile: (
    lease: string,
    datasetVersionId: string,
    fileName: string,
    bytes: Uint8Array,
  ) => Promise<void>;
  writeDescriptorRow: (
    lease: string,
    datasetVersionId: string,
    descriptor: PublishedBundleDescriptor,
  ) => Promise<void>;
  writeManifestRow: (
    lease: string,
    datasetVersionId: string,
    manifest: PublishedDatasetManifest,
  ) => Promise<void>;
}

export interface StageRequest {
  config: CanonicalImporterConfig;
  snapshotBytes: Uint8Array;
  encoding: string;
  ports: StagePorts;
}

export interface PublishRequest {
  config: CanonicalImporterConfig;
  candidateVersionId: string;
  approval: ReviewApproval;
  ports: PublishPorts;
}

export interface PublishResult {
  datasetVersionId: string;
  status: 'published' | 'rejected' | 'already-published';
  reason?: string;
  issues?: string[];
  /** Importer-only operational warnings. A warning never means failure. */
  warnings?: string[];
}

/** Cap issue lists so every private record stays bounded. */
export const MAX_ISSUES = 20;
export const MAX_ISSUE_LENGTH = 240;

/** Cap issue count, collapse whitespace and truncate oversized issue messages. */
export function boundedIssues(issues: readonly string[]): string[] {
  return issues.slice(0, MAX_ISSUES).map((issue) => {
    const single = issue.replace(/\s+/g, ' ').trim();
    return single.length > MAX_ISSUE_LENGTH
      ? `${single.slice(0, MAX_ISSUE_LENGTH)}...`
      : single;
  });
}

/** Logging is never an import failure. Returns false when the sink rejected. */
export function tryLog(log: (msg: string) => void, msg: string): boolean {
  try {
    log(msg);
    return true;
  } catch {
    return false;
  }
}
