import {
  deserializeCatalogue,
  validateReferentialIntegrity,
  type DatasetRecordCounts,
  type MedicationCatalogueSnapshot,
  type PublishedBundleDescriptor,
  type PublishedDatasetManifest,
} from '@intermed/domain';
import {
  assertValidConfig,
  boundedIssues,
  canonicalizeConfig,
  hasControlCharacter,
  isAmbiguousWrite,
  isPublicationConflict,
  PublicationLeaseError,
  tryLog,
  type PublishRequest,
  type PublishResult,
} from './core';
import { catalogueCounts } from './diff';

/**
 * Preserved source tokens reported by the domain checker; they never block a
 * publication. Structural reference, checksum and count problems do.
 */
const PRESERVED_TOKEN_NOTES = new Set(['invalid-unit', 'ambiguous-decimal']);

type Component = 'bundleFile' | 'descriptor' | 'manifest';

interface ExpectedPublication {
  fileName: string;
  bytes: Uint8Array;
  descriptor: PublishedBundleDescriptor;
  manifest: PublishedDatasetManifest;
}

interface PublicationState {
  file: Uint8Array | null;
  descriptor: PublishedBundleDescriptor | null;
  manifest: PublishedDatasetManifest | null;
}

type SettleOutcome =
  | { kind: 'clean' }
  | { kind: 'identical' }
  | { kind: 'partial'; missing: Component[] }
  | { kind: 'collision'; issue: string };

/** Require a trimmed numeric major.minor.patch version of at most 50 characters. */
function isNumericSemver(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 50) return false;
  if (value !== value.trim()) return false;
  return /^\d+\.\d+\.\d+$/.test(value);
}

/** Require an absolute HTTPS URL without credentials, fragments or control characters. */
function isValidPublicUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  if (hasControlCharacter(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username !== '' || parsed.password !== '') return false;
    if (parsed.hash !== '') return false;
    return true;
  } catch {
    return false;
  }
}

/** Compare publication byte arrays without normalizing their contents. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Datetime values are normalized to instants; nothing else is normalized.
 * REST metadata on read rows is ignored because only known contract fields
 * are compared.
 */
function sameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return left === right;
  return leftTime === rightTime;
}

/** Require identical own count keys and values, independent of key order. */
function sameCounts(
  expected: Readonly<Record<string, number>> | DatasetRecordCounts,
  actual: Readonly<Record<string, number>> | DatasetRecordCounts,
): boolean {
  const expectedEntries = Object.entries(expected);
  if (expectedEntries.length !== Object.keys(actual).length) return false;
  const actualCounts = actual as Record<string, number>;
  return expectedEntries.every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(actual, key) &&
      actualCounts[key] === value,
  );
}

/** Compare every public descriptor field while ignoring unrelated REST metadata. */
function descriptorMatches(
  actual: PublishedBundleDescriptor,
  expected: PublishedBundleDescriptor,
): boolean {
  return (
    actual.id === expected.id &&
    actual.datasetVersionId === expected.datasetVersionId &&
    actual.fileName === expected.fileName &&
    actual.contentType === expected.contentType &&
    actual.byteSize === expected.byteSize &&
    actual.checksum === expected.checksum &&
    actual.url === expected.url
  );
}

/** Compare manifest contract fields, normalizing only equivalent timestamp representations. */
function manifestMatches(
  actual: PublishedDatasetManifest,
  expected: PublishedDatasetManifest,
): boolean {
  return (
    actual.dataset === expected.dataset &&
    actual.datasetVersionId === expected.datasetVersionId &&
    actual.version === expected.version &&
    actual.sourceIds.length === expected.sourceIds.length &&
    expected.sourceIds.every((id, index) => actual.sourceIds[index] === id) &&
    actual.upstreamVersion === expected.upstreamVersion &&
    sameInstant(actual.upstreamPublishedAt, expected.upstreamPublishedAt) &&
    sameInstant(actual.publishedAt, expected.publishedAt) &&
    sameInstant(actual.importedAt, expected.importedAt) &&
    actual.checksum === expected.checksum &&
    actual.schemaVersion === expected.schemaVersion &&
    actual.minimumClientVersion === expected.minimumClientVersion &&
    sameCounts(expected.recordCounts, actual.recordCounts) &&
    actual.coverage === expected.coverage &&
    actual.rightsApprovalReference === expected.rightsApprovalReference &&
    actual.clinicalReviewReference === expected.clinicalReviewReference &&
    actual.previousVersionId === expected.previousVersionId
  );
}

/**
 * Classify the public components of this generation. Only a prefix of the
 * write order counts as an interrupted publication that can be resumed; any
 * component that exists with different content is an immutable collision and
 * nothing is updated or deleted.
 */
function classify(
  state: PublicationState,
  expected: ExpectedPublication,
): SettleOutcome {
  if (state.file !== null && !sameBytes(state.file, expected.bytes)) {
    return { kind: 'collision', issue: 'publication-file-conflict' };
  }
  if (
    state.descriptor !== null &&
    !descriptorMatches(state.descriptor, expected.descriptor)
  ) {
    return { kind: 'collision', issue: 'publication-descriptor-conflict' };
  }
  if (
    state.manifest !== null &&
    !manifestMatches(state.manifest, expected.manifest)
  ) {
    return { kind: 'collision', issue: 'publication-manifest-conflict' };
  }
  if (state.manifest !== null) {
    if (state.descriptor === null || state.file === null) {
      return { kind: 'collision', issue: 'publication-manifest-orphan' };
    }
    return { kind: 'identical' };
  }
  if (state.descriptor !== null && state.file === null) {
    return { kind: 'collision', issue: 'publication-descriptor-orphan' };
  }
  if (state.descriptor !== null)
    return { kind: 'partial', missing: ['manifest'] };
  if (state.file !== null) {
    return { kind: 'partial', missing: ['descriptor', 'manifest'] };
  }
  return { kind: 'clean' };
}

/** Collect distinct source and generation mismatches across all catalogue entity rows. */
function provenanceIssues(
  catalogue: MedicationCatalogueSnapshot,
  candidateVersionId: string,
): string[] {
  const sourceIds = new Set<string>(
    catalogue.dataSources.map((source) => source.id),
  );
  const rows: Array<{ entity: string; ref: string }> = [];
  const note = (entity: string, sourceId: string, datasetVersionId: string) => {
    if (datasetVersionId !== candidateVersionId) {
      rows.push({ entity, ref: 'dataset-version' });
    }
    if (!sourceIds.has(sourceId)) rows.push({ entity, ref: 'source' });
  };
  for (const item of catalogue.products) {
    note('product', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.activeIngredients) {
    note('ingredient', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.medicationIngredients) {
    note('join', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.atcCodes) {
    note('atc', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.dosageForms) {
    note('form', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.manufacturers) {
    note('manufacturer', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.marketingAuthorizationHolders) {
    note('holder', item.sourceId, item.datasetVersionId);
  }
  for (const item of catalogue.regulatoryDocuments) {
    note('document', item.sourceId, item.datasetVersionId);
  }
  const issues = rows.map((row) => `${row.entity}:${row.ref}`);
  if (catalogue.datasetVersions.length !== 1)
    issues.push('dataset-version-count');
  return [...new Set(issues)];
}

/**
 * Publish one reviewed candidate.
 *
 * The manifest row is the commit point. Idempotency is resolved first under
 * the publication lease, before any baseline check, so an identical existing
 * publication is recognized even after the baseline advanced. Interrupted
 * publications are resumed by creating only the missing components, and
 * differing existing objects are never updated or deleted. Failures after the
 * manifest is committed are reported as warnings, never as failed imports, and
 * ambiguous backend writes are read-verified against the commit point.
 */
export async function publish(req: PublishRequest): Promise<PublishResult> {
  const { config, candidateVersionId, approval, ports } = req;
  assertValidConfig(config);

  const reject = (reason: string): PublishResult => ({
    datasetVersionId: candidateVersionId,
    status: 'rejected',
    reason,
  });

  if (
    !approval.approvedBy.trim() ||
    !approval.approvedAt ||
    !approval.approvalReference.trim() ||
    approval.operationalApproval !== true
  ) {
    return reject('invalid-approval');
  }

  const candidateBytes = await ports.readCandidate(candidateVersionId);
  if (!candidateBytes) return reject('missing-candidate');

  const configSha256 = ports.sha256.hash(canonicalizeConfig(config));
  const candidateSha256 = ports.sha256.hash(candidateBytes);
  if (
    approval.candidateVersionId !== candidateVersionId ||
    approval.configSha256 !== configSha256 ||
    approval.candidateSha256 !== candidateSha256
  ) {
    return reject('tampered-approval');
  }

  const review = await ports.readReview(candidateVersionId);
  if (!review) return reject('missing-review');
  // The approval binds the raw snapshot recorded in the private review.
  if (review.rawSnapshotSha256 !== approval.rawSnapshotSha256) {
    return reject('tampered-approval');
  }
  if (review.completeness !== 'complete') return reject('incomplete-review');
  if (
    review.candidateVersionId !== candidateVersionId ||
    review.configSha256 !== configSha256 ||
    review.candidateSha256 !== candidateSha256 ||
    review.baselineVersionId !== approval.baselineVersionId ||
    review.baselineFingerprint !== approval.baselineFingerprint
  ) {
    return reject('tampered-review');
  }

  const decoded = deserializeCatalogue(
    new TextDecoder().decode(candidateBytes),
  );
  if (!decoded.ok) {
    return {
      ...reject('domain-integrity-failed'),
      issues: boundedIssues(
        decoded.issues.map((issue) => `${issue.code}:${issue.field}`),
      ),
    };
  }
  const catalogue = decoded.snapshot;

  // Empty candidates never publish, even with fabricated approval.
  if (catalogue.products.length === 0) return reject('empty-catalogue');

  const version = catalogue.datasetVersions[0];
  if (
    !version ||
    catalogue.datasetVersions.length !== 1 ||
    version.id !== candidateVersionId
  ) {
    return reject('candidate-identity-mismatch');
  }

  const provenance = provenanceIssues(catalogue, candidateVersionId);
  if (provenance.length > 0) {
    return {
      ...reject('provenance-mismatch'),
      issues: boundedIssues(provenance),
    };
  }

  const actualCounts = catalogueCounts(catalogue);
  if (
    !sameCounts(review.recordCounts, actualCounts) ||
    !sameCounts(actualCounts, review.recordCounts)
  ) {
    return reject('tampered-review');
  }

  const structural = validateReferentialIntegrity(catalogue).filter(
    (issue) => !PRESERVED_TOKEN_NOTES.has(issue.code),
  );
  if (structural.length > 0) {
    return {
      ...reject('candidate-integrity'),
      issues: boundedIssues(
        structural.map((issue) => `${issue.code}:${issue.field}`),
      ),
    };
  }

  if (
    (review.largeRemovalRequired || approval.largeRemovalRequired) &&
    approval.largeRemovalApproved !== true
  ) {
    return reject('large-removal-approval-required');
  }

  if (!isNumericSemver(version.minimumClientVersion)) {
    return reject('invalid-minimum-client-version');
  }

  const embeddedPrevious = version.previousVersionId;
  const embeddedPreviousId =
    embeddedPrevious.status === 'present' ? embeddedPrevious.value : null;

  if (approval.baselineVersionId !== embeddedPreviousId) {
    return reject('tampered-approval');
  }

  const publicSha256 = `sha256:${candidateSha256.toLowerCase()}`;
  const descriptorId = ports.sha256
    .hash(`bundle-${candidateVersionId}`)
    .substring(0, 36);
  const fileName = `bundle-${descriptorId}.json`;
  const publicUrl =
    typeof ports.resolvePublicUrl === 'function'
      ? ports.resolvePublicUrl(candidateVersionId, fileName)
      : `${(ports.publicBaseUrl ?? 'https://published.invalid').replace(/\/+$/, '')}/${fileName}`;

  const expected: ExpectedPublication = {
    fileName,
    bytes: candidateBytes,
    descriptor: {
      id: descriptorId,
      datasetVersionId: candidateVersionId,
      fileName,
      contentType: 'application/json',
      byteSize: candidateBytes.length,
      checksum: publicSha256,
      url: publicUrl,
    },
    manifest: {
      dataset: version.dataset,
      datasetVersionId: candidateVersionId,
      version: version.version,
      sourceIds: [...version.sourceIds],
      upstreamVersion:
        version.upstreamVersion.status === 'present'
          ? version.upstreamVersion.value
          : null,
      upstreamPublishedAt:
        version.upstreamPublishedAt.status === 'present'
          ? version.upstreamPublishedAt.value
          : null,
      publishedAt: ports.publicationTimestamp ?? null,
      importedAt: version.importedAt,
      checksum: publicSha256,
      schemaVersion: version.schemaVersion,
      minimumClientVersion: version.minimumClientVersion,
      recordCounts: { ...actualCounts },
      coverage: version.coverage,
      rightsApprovalReference: version.rightsApprovalReference,
      clinicalReviewReference: version.clinicalReviewReference,
      previousVersionId: embeddedPreviousId,
    },
  };

  if (!isValidPublicUrl(expected.descriptor.url)) {
    return reject('invalid-public-url');
  }

  const lock = await ports.acquirePublicationLock();
  const warnings: string[] = [];
  if (typeof lock.lease !== 'string' || lock.lease.trim() === '') {
    try {
      await lock.release();
    } catch {
      warnings.push('lock-release-failed');
    }
    throw new PublicationLeaseError();
  }
  const lease = lock.lease;

  const readState = async (): Promise<PublicationState> => ({
    file: await ports.readPublishedBundleFile(candidateVersionId, fileName),
    descriptor: await ports.readPublishedDescriptor(candidateVersionId),
    manifest: await ports.readPublishedManifest(candidateVersionId),
  });

  const settle = async (): Promise<SettleOutcome> =>
    classify(await readState(), expected);

  const writeComponent = async (component: Component): Promise<void> => {
    if (component === 'bundleFile') {
      await ports.writeBundleFile(
        lease,
        candidateVersionId,
        fileName,
        candidateBytes,
      );
    } else if (component === 'descriptor') {
      await ports.writeDescriptorRow(
        lease,
        candidateVersionId,
        expected.descriptor,
      );
    } else {
      await ports.writeManifestRow(
        lease,
        candidateVersionId,
        expected.manifest,
      );
    }
  };

  const isBaselineCurrent = async (): Promise<boolean> => {
    const baseline = await ports.readBaseline();
    return (
      baseline.baselineVersionId === approval.baselineVersionId &&
      baseline.baselineFingerprint === approval.baselineFingerprint
    );
  };

  /** Read-verify after a conflict or an ambiguous write; never updates or deletes. */
  const recover = async (error: unknown): Promise<PublishResult> => {
    const outcome = await settle();
    if (outcome.kind === 'identical') {
      if (isAmbiguousWrite(error)) {
        warnings.push('post-commit-read-verified');
        return { datasetVersionId: candidateVersionId, status: 'published' };
      }
      return {
        datasetVersionId: candidateVersionId,
        status: 'already-published',
      };
    }
    if (outcome.kind === 'partial') {
      if (!(await isBaselineCurrent())) {
        return reject('stale-baseline');
      }
      for (const component of outcome.missing) await writeComponent(component);
      warnings.push('resumed-interrupted-publication');
      return { datasetVersionId: candidateVersionId, status: 'published' };
    }
    if (outcome.kind === 'collision') {
      return {
        ...reject('publication-collision'),
        issues: boundedIssues([outcome.issue]),
      };
    }
    throw error;
  };

  let result: PublishResult | null = null;
  let failure: unknown = null;
  try {
    try {
      const outcome = await settle();
      if (outcome.kind === 'identical') {
        result = {
          datasetVersionId: candidateVersionId,
          status: 'already-published',
        };
      } else if (outcome.kind === 'collision') {
        result = {
          ...reject('publication-collision'),
          issues: boundedIssues([outcome.issue]),
        };
      } else if (outcome.kind === 'partial') {
        if (!(await isBaselineCurrent())) {
          result = reject('stale-baseline');
        } else {
          for (const component of outcome.missing)
            await writeComponent(component);
          warnings.push('resumed-interrupted-publication');
          result = {
            datasetVersionId: candidateVersionId,
            status: 'published',
          };
        }
      } else {
        // Idempotency is settled first; the baseline is rechecked under the
        // lease so a concurrent advance can never publish stale material.
        if (!(await isBaselineCurrent())) {
          result = reject('stale-baseline');
        } else {
          await writeComponent('bundleFile');
          await writeComponent('descriptor');
          await writeComponent('manifest');
          result = {
            datasetVersionId: candidateVersionId,
            status: 'published',
          };
        }
      }
    } catch (error) {
      if (isPublicationConflict(error) || isAmbiguousWrite(error)) {
        result = await recover(error);
      } else {
        failure = error;
      }
    }
  } finally {
    // Release is cleanup, never a failed import: after the manifest commit a
    // release failure is reported as a warning.
    try {
      await lock.release();
    } catch {
      warnings.push('lock-release-failed');
    }
  }

  if (failure !== null) throw failure;
  if (result === null) throw new Error('publication produced no outcome');

  if (
    !tryLog(ports.log, `Publication ${result.status} for ${candidateVersionId}`)
  ) {
    warnings.push('log-failed');
  }
  if (warnings.length > 0) {
    return { ...result, warnings: [...(result.warnings ?? []), ...warnings] };
  }
  return result;
}
