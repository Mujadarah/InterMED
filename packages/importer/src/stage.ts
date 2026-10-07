import {
  serializeCatalogue,
  validateReferentialIntegrity,
} from '@intermed/domain';
import { validateSyntheticSource } from '@intermed/data-access';
import {
  assertValidConfig,
  boundedIssues,
  canonicalizeConfig,
  tryLog,
  type ReviewData,
  type StageRequest,
  type StageResult,
} from './core';
import { deriveGenerationVersionKey, deriveIdentity } from './identity';
import {
  ENTITY_LIST_NAMES,
  parseRawSnapshot,
  type RawRow,
} from './parser-facade';
import { canonicalEncodingName } from './parser';
import { normalizeKey } from './normalize';
import { catalogueCounts, diffProducts } from './diff';

/**
 * Preserved source tokens reported by the domain checker. They keep the source
 * value verbatim by design and never block staging; structural reference and
 * checksum problems do block staging.
 */
const PRESERVED_TOKEN_NOTES = new Set(['invalid-unit', 'ambiguous-decimal']);

const EMPTY_IDENTITY = {
  datasetVersionId: '',
  generationVersionKey: '',
  configSha256: '',
  snapshotSha256: '',
  candidateSha256: '',
};

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Stage one raw snapshot into a sealed, reviewable candidate.
 *
 * Failures are quarantined privately with bounded, code-only records: run
 * summaries and logs never carry source text or backend detail. Empty and
 * partial snapshots never produce a candidate; a large drop produces a private
 * quarantine record plus a reviewable candidate that needs threshold approval.
 */
export async function stage(req: StageRequest): Promise<StageResult> {
  const { config, encoding, ports } = req;
  assertValidConfig(config);
  const configSha256 = ports.sha256.hash(canonicalizeConfig(config));
  const snapshotBytes =
    req.snapshotBytes.length > 0
      ? req.snapshotBytes
      : ports.readRawSnapshot
        ? await ports.readRawSnapshot()
        : req.snapshotBytes;
  const snapshotSha256 = ports.sha256.hash(snapshotBytes);
  const runId = ports.sha256
    .hash(`run\u001f${configSha256}\u001f${snapshotSha256}`)
    .substring(0, 16);

  const quarantine = async (
    reason: string,
    issueCodes: string[],
  ): Promise<StageResult> => {
    const issues = boundedIssues(issueCodes);
    await ports.writeQuarantine(runId, snapshotBytes, reason, issues);
    await ports.writeRunSummary(runId, {
      runId,
      status: 'quarantined',
      completenessStatus: reason,
      issueCodes: issues,
    });
    tryLog(ports.log, `Quarantined run ${runId} with ${reason}`);
    return {
      runId,
      identity: EMPTY_IDENTITY,
      status: 'quarantined',
      completenessStatus: reason,
      diffSummary: 'Not staged',
      approvalRequired: false,
      issues,
    };
  };

  // The encoding policy is bound to the config and therefore to the identity.
  const requestedEncoding = canonicalEncodingName(encoding);
  if (requestedEncoding === null) {
    return quarantine('unsupported-encoding', ['encoding-unsupported']);
  }
  if (requestedEncoding !== canonicalEncodingName(config.parserEncoding)) {
    return quarantine('encoding-mismatch', ['encoding-not-config-policy']);
  }

  const parseResult = parseRawSnapshot(snapshotBytes, config);
  if (parseResult.status === 'quarantined') {
    return quarantine(parseResult.reason, parseResult.issues);
  }
  const raw = parseResult.snapshot;
  const issues = [...parseResult.issues];

  if (raw.synthetic !== true) {
    return quarantine('rejected', ['not-marked-synthetic']);
  }
  if (raw.completeness !== 'full') {
    return quarantine('partial-snapshot', ['completeness-not-full']);
  }
  const allowlist = config.syntheticAllowlist.map((key) => normalizeKey(key));
  if (!allowlist.includes(raw.sourceKey)) {
    return quarantine('rejected', ['source-key-not-allowlisted']);
  }

  // Every row must declare this source and this generation consistently.
  const provenance: string[] = [];
  if (raw.dataSource.sourceKey !== raw.sourceKey) {
    provenance.push('data-source-provenance');
  }
  if (!isText(raw.datasetVersion.version)) {
    provenance.push('dataset-version-key-missing');
  }
  for (const name of ENTITY_LIST_NAMES) {
    for (const row of raw[name]) {
      if (row.sourceKey !== raw.sourceKey) {
        provenance.push(`row-provenance:${name}`);
      }
      if (!isText(row.datasetVersionKey)) {
        provenance.push(`row-version-key:${name}`);
      }
    }
  }
  if (provenance.length > 0) {
    return quarantine('provenance-mismatch', provenance);
  }

  // Rewrite the raw version key and per-row provenance to this generation
  // before the domain validator constructs and seals the catalogue.
  const generationVersionKey = deriveGenerationVersionKey(
    configSha256,
    snapshotSha256,
    ports.sha256,
  );
  raw.datasetVersion.version = generationVersionKey;
  raw.datasetVersionKey = generationVersionKey;
  for (const name of ENTITY_LIST_NAMES) {
    for (const row of raw[name] as RawRow[]) {
      row.datasetVersionKey = generationVersionKey;
    }
  }

  const domainValidation = validateSyntheticSource({
    synthetic: true,
    dataSource: raw.dataSource,
    datasetVersion: raw.datasetVersion,
    products: raw.products,
    activeIngredients: raw.activeIngredients,
    medicationIngredients: raw.medicationIngredients,
    atcCodes: raw.atcCodes,
    dosageForms: raw.dosageForms,
    manufacturers: raw.manufacturers,
    marketingAuthorizationHolders: raw.marketingAuthorizationHolders,
    regulatoryDocuments: raw.regulatoryDocuments,
  });
  if (!domainValidation.ok) {
    return quarantine(
      'invalid',
      domainValidation.issues.map((issue) => `invalid-source:${issue.path}`),
    );
  }
  const snapshot = domainValidation.snapshot;
  if (snapshot.products.length === 0) {
    return quarantine('empty-snapshot', ['no-products']);
  }
  const structural = validateReferentialIntegrity(snapshot).filter(
    (issue) => !PRESERVED_TOKEN_NOTES.has(issue.code),
  );
  if (structural.length > 0) {
    return quarantine(
      'referential-integrity',
      structural.map((issue) => `${issue.code}:${issue.entity}.${issue.field}`),
    );
  }

  const candidateBytes = new TextEncoder().encode(serializeCatalogue(snapshot));
  const identity = deriveIdentity(
    config,
    snapshotBytes,
    candidateBytes,
    ports.sha256,
  );
  const sealedVersion = snapshot.datasetVersions[0];
  if (
    !sealedVersion ||
    sealedVersion.id !== identity.datasetVersionId ||
    sealedVersion.version !== identity.generationVersionKey
  ) {
    throw new Error('generation identity does not match the sealed catalogue');
  }

  const baseline = await ports.readBaseline();
  if (baseline.baselineVersionId && !baseline.catalogue) {
    return quarantine('baseline-unavailable', ['baseline-catalogue-missing']);
  }
  const productDiff = diffProducts(baseline.catalogue, snapshot, config);
  const largeRemovalRequired = productDiff.largeRemovalRequired;
  let quarantineReason: string | undefined;
  if (largeRemovalRequired) {
    quarantineReason = 'large-removal';
    await ports.writeQuarantine(runId, snapshotBytes, 'large-removal', [
      'large-removal-threshold-exceeded',
    ]);
  }
  const diffSummaryText = largeRemovalRequired
    ? 'Large drop detected'
    : baseline.catalogue
      ? 'Compared with baseline'
      : 'First generation';

  const reviewData: ReviewData = {
    candidateVersionId: identity.datasetVersionId,
    configSha256: identity.configSha256,
    rawSnapshotSha256: identity.snapshotSha256,
    candidateSha256: identity.candidateSha256,
    baselineVersionId: baseline.baselineVersionId,
    baselineFingerprint: baseline.baselineFingerprint,
    completeness: 'complete',
    recordCounts: catalogueCounts(snapshot),
    diffSummary: productDiff.diff,
    largeRemovalRequired,
    ...(quarantineReason === undefined ? {} : { quarantineReason }),
    issues: boundedIssues(issues),
  };

  await ports.writeCandidate(identity.datasetVersionId, candidateBytes);
  await ports.writeReview(identity.datasetVersionId, reviewData);
  await ports.writeRunSummary(runId, {
    runId,
    status: 'staged',
    completenessStatus: 'complete',
    datasetVersionId: identity.datasetVersionId,
    issueCodes: boundedIssues(issues),
    largeRemovalRequired,
  });
  tryLog(ports.log, `Staged generation ${identity.datasetVersionId}`);

  return {
    runId,
    identity,
    status: 'staged',
    completenessStatus: 'complete',
    diffSummary: diffSummaryText,
    approvalRequired: true,
    issues: boundedIssues(issues),
  };
}

export function generateCandidate(): never {
  throw new Error('generateCandidate is retired; use stage with private ports');
}
