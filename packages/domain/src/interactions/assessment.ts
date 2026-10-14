import type {
  CanonicalIngredientPair,
  DrugInteraction,
  EvaluatedPairCoverage,
  InteractionEvaluation,
  InteractionEvidence,
  InteractionIncompleteReason,
  MergedProviderResults,
  PairAssessment,
  PairAssessmentInput,
  PairAssessmentSourcePosition,
  PairCoverageStatus,
} from './types';
import { canonicalPair, compareStrings, pairKey } from './pairs';
import { isProviderResult, isRecord } from './provider-result';

export const INTERACTION_ASSESSMENT_LOGIC_VERSION = '2.0.0';

interface AssessmentRecord {
  readonly record: DrugInteraction;
  readonly providerId?: string;
  readonly retrievedAt?: string;
  readonly mappingReview?: InteractionEvaluation['severityMappingReview'];
  readonly outdated: boolean;
  readonly datasetMismatch: boolean;
  readonly sourceMismatch: boolean;
  readonly validCurrent: boolean;
  readonly historical: boolean;
}

interface PairSource {
  readonly sourceId: DrugInteraction['sourceId'];
  readonly sourceVersion: string;
  readonly providerId?: string;
  readonly status?: PairCoverageStatus;
  readonly hasCoverage: boolean;
  readonly available: boolean;
  readonly stale: boolean;
  readonly invalidCoverage: boolean;
  readonly retrievedAt?: string;
  readonly reason?: string;
  readonly records: AssessmentRecord[];
}

type PairSourceDetails = Omit<
  PairSource,
  'records' | 'sourceId' | 'sourceVersion'
> & {
  readonly sourceId?: PairSource['sourceId'];
  readonly sourceVersion?: string;
};

interface AssessmentState {
  readonly records: AssessmentRecord[];
  readonly sources: PairSource[];
  readonly reasons: Set<string>;
  unresolved: boolean;
  truncated: boolean;
  globalInvalidity: boolean;
  providerUnavailable: boolean;
  evidenceConflict: boolean;
}

const KNOWN_REASONS = new Set([
  'dataset-version-missing',
  'evidence-link-invalid',
  'no-pairs-to-evaluate',
  'no-products-selected',
  'only-inactive-records',
  'outdated-record-source-version',
  'pair-limit-exceeded',
  'provider-description-error',
  'provider-descriptor-invalid',
  'provider-error',
  'provider-omitted-pair-coverage',
  'provider-pair-coverage-incomplete',
  'provider-pair-coverage-invalid',
  'provider-result-invalid',
  'provider-timeout',
  'provider-unavailable',
  'provider-version-mismatch',
  'record-dataset-version-mismatch',
  'record-pair-outside-request',
  'rights-not-permitted',
  'stale-source-data',
  'timeout-scheduler-unavailable',
  'unresolved-inputs',
  'unreviewed-ingredient-mapping',
  'unsupported-context',
  'unknown-ingredient',
  'online-required',
]);

const UNAVAILABLE_REASONS = new Set([
  'online-required',
  'provider-description-error',
  'provider-descriptor-invalid',
  'provider-error',
  'provider-result-invalid',
  'provider-timeout',
  'provider-unavailable',
  'rights-not-permitted',
  'timeout-scheduler-unavailable',
]);

function matchesPair(
  candidate: CanonicalIngredientPair,
  requestedKey: string,
): boolean {
  return pairKey(canonicalPair(candidate[0], candidate[1])) === requestedKey;
}

function addReason(state: AssessmentState, reason: string | undefined): void {
  if (reason && KNOWN_REASONS.has(reason)) state.reasons.add(reason);
}

function addUnavailableReason(
  state: AssessmentState,
  reason: string | undefined,
): void {
  state.reasons.add(
    reason && UNAVAILABLE_REASONS.has(reason) ? reason : 'provider-unavailable',
  );
}

function recordRetrievedAt(
  record: DrugInteraction,
  evidence: readonly InteractionEvidence[],
  fallback?: string,
): string | undefined {
  const matchingTimes = evidence
    .filter(
      (item) =>
        item.interactionId === record.id &&
        item.sourceId === record.sourceId &&
        item.sourceVersion === record.sourceVersion,
    )
    .map((item) => item.retrievedAt)
    .sort(compareStrings);
  return matchingTimes[0] ?? fallback;
}

function createSource(
  state: AssessmentState,
  details: PairSourceDetails,
): PairSource | undefined {
  if (!details.sourceId || !details.sourceVersion) {
    state.reasons.add('provider-pair-coverage-invalid');
    state.globalInvalidity = true;
    return undefined;
  }
  const source: PairSource = {
    ...details,
    sourceId: details.sourceId,
    sourceVersion: details.sourceVersion,
    records: [],
  };
  state.sources.push(source);
  if (details.stale) state.reasons.add('stale-source-data');
  if (details.status === 'unsupported-context')
    state.reasons.add('unsupported-context');
  if (details.status === 'not-covered') {
    addReason(state, details.reason);
    if (!details.reason || !KNOWN_REASONS.has(details.reason))
      state.reasons.add('provider-pair-coverage-incomplete');
  }
  if (details.invalidCoverage)
    state.reasons.add('provider-pair-coverage-invalid');
  if (!details.available) addUnavailableReason(state, details.reason);
  return source;
}

function recordMatchesSource(
  entry: AssessmentRecord,
  source: PairSource,
): boolean {
  return (
    entry.record.sourceId === source.sourceId &&
    entry.record.sourceVersion === source.sourceVersion &&
    (source.providerId === undefined ||
      entry.providerId === undefined ||
      source.providerId === entry.providerId)
  );
}

function addRecord(
  state: AssessmentState,
  entry: AssessmentRecord,
  sources: readonly PairSource[],
): void {
  state.records.push(entry);
  for (const source of sources)
    if (recordMatchesSource(entry, source)) source.records.push(entry);
  if (entry.outdated) state.reasons.add('outdated-record-source-version');
  if (entry.datasetMismatch)
    state.reasons.add('record-dataset-version-mismatch');
  if (entry.sourceMismatch) state.reasons.add('provider-version-mismatch');
}

interface EvaluationDescriptor {
  readonly providerId?: string;
  readonly sourceId?: DrugInteraction['sourceId'];
  readonly sourceVersion?: string;
}

interface EvaluationInputs {
  readonly evaluation: InteractionEvaluation;
  readonly rows: readonly EvaluatedPairCoverage[];
  readonly descriptor: EvaluationDescriptor;
}

interface FilteredPairRecord {
  readonly record: DrugInteraction;
  readonly historical: boolean;
}

/**
 * Apply the evaluation-level flags. Returns whether the evaluation is
 * available for this pair.
 */
function applyEvaluationFlags(
  state: AssessmentState,
  evaluation: InteractionEvaluation,
): boolean {
  if (evaluation.pairLimit) {
    state.truncated = true;
    state.reasons.add('pair-limit-exceeded');
  }
  if (evaluation.unresolvedInputs.length > 0) {
    state.unresolved = true;
    state.reasons.add('unresolved-inputs');
    for (const input of evaluation.unresolvedInputs)
      addReason(state, input.reason);
  }
  const available = evaluation.status !== 'unavailable';
  if (!available) {
    // An unavailable evaluation is unavailable for every pair, including when
    // it carries no coverage rows and no source version to attribute them to.
    state.providerUnavailable = true;
    addUnavailableReason(state, evaluation.unavailableReason);
  }
  return available;
}

/** Source identity for rows that omit it, preferring this pair's coverage. */
function describeEvaluation(
  rows: readonly EvaluatedPairCoverage[],
  evaluation: InteractionEvaluation,
): EvaluationDescriptor {
  const fallbackRow = rows[0] ?? evaluation.evaluatedPairCoverage[0];
  const fallbackVersion = evaluation.sourceVersions[0];
  const providerId = fallbackRow?.providerId ?? fallbackVersion?.providerId;
  const sourceId = fallbackRow?.sourceId ?? fallbackVersion?.sourceId;
  const sourceVersion =
    fallbackRow?.sourceVersion ?? fallbackVersion?.sourceVersion;
  return {
    ...(providerId !== undefined ? { providerId } : {}),
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(sourceVersion !== undefined ? { sourceVersion } : {}),
  };
}

/**
 * Build this pair's sources from its coverage rows plus every source version
 * that has no row of its own, so no provider version is silently dropped.
 */
function buildEvaluationSources(
  state: AssessmentState,
  inputs: EvaluationInputs,
  available: boolean,
): PairSource[] {
  const { evaluation, rows, descriptor } = inputs;
  const sources: PairSource[] = [];
  for (const row of rows) {
    const duplicate =
      rows.filter((candidate) => candidate.providerId === row.providerId)
        .length > 1;
    const sourceId = row.sourceId ?? descriptor.sourceId;
    const sourceVersion = row.sourceVersion ?? descriptor.sourceVersion;
    const providerId = row.providerId ?? descriptor.providerId;
    const source = createSource(state, {
      ...(sourceId ? { sourceId } : {}),
      ...(sourceVersion ? { sourceVersion } : {}),
      ...(providerId ? { providerId } : {}),
      status: row.status,
      hasCoverage: true,
      available,
      stale: row.stale === true,
      invalidCoverage: duplicate,
      ...(row.retrievedAt ? { retrievedAt: row.retrievedAt } : {}),
      ...(row.reason ? { reason: row.reason } : {}),
    });
    if (source) sources.push(source);
    if (duplicate) state.globalInvalidity = true;
  }

  const coveredProviders = new Set(
    sources.flatMap((source) => (source.providerId ? [source.providerId] : [])),
  );
  const fallbackByProvider = new Map<
    string,
    (typeof evaluation.sourceVersions)[number]
  >();
  for (const version of evaluation.sourceVersions)
    if (!fallbackByProvider.has(version.providerId))
      fallbackByProvider.set(version.providerId, version);
  for (const version of fallbackByProvider.values()) {
    if (coveredProviders.has(version.providerId)) continue;
    const source = createSource(state, {
      ...version,
      hasCoverage: false,
      available,
      stale: false,
      invalidCoverage: false,
    });
    if (source) sources.push(source);
  }
  if (sources.length === 0 && !evaluation.pairLimit)
    state.reasons.add('provider-pair-coverage-incomplete');
  return sources;
}

/** Retain this pair's records with their currency, provenance and history. */
function ingestEvaluationRecords(
  state: AssessmentState,
  inputs: EvaluationInputs,
  sources: readonly PairSource[],
  requestedKey: string,
): FilteredPairRecord[] {
  const { evaluation, rows, descriptor } = inputs;
  const records: FilteredPairRecord[] = [
    ...evaluation.interactions.map((record) => ({ record, historical: false })),
    ...evaluation.inactiveRecords.map(({ record }) => ({
      record,
      historical: true,
    })),
  ].filter(({ record }) =>
    matchesPair(
      canonicalPair(record.ingredientAId, record.ingredientBId),
      requestedKey,
    ),
  );

  for (const item of records) {
    const { record } = item;
    const matchingRow = rows.find((row) => row.sourceId === record.sourceId);
    const expectedSourceId = matchingRow?.sourceId ?? descriptor.sourceId;
    const expectedSourceVersion =
      matchingRow?.sourceVersion ?? descriptor.sourceVersion;
    const sourceMismatch =
      expectedSourceId !== undefined && record.sourceId !== expectedSourceId;
    const versionMismatch =
      expectedSourceVersion !== undefined &&
      record.sourceVersion !== expectedSourceVersion;
    const outdated = record.isOutdated === true || versionMismatch;
    const datasetMismatch =
      record.datasetVersionId !== evaluation.datasetVersionId;
    const historical = item.historical || record.recordStatus !== 'current';
    const recordProviderId = matchingRow?.providerId ?? descriptor.providerId;
    const retrievedAt = recordRetrievedAt(
      record,
      evaluation.evidence,
      rows.find(
        (row) =>
          row.sourceId === record.sourceId &&
          row.sourceVersion === record.sourceVersion,
      )?.retrievedAt,
    );
    const entry: AssessmentRecord = {
      record,
      ...(recordProviderId ? { providerId: recordProviderId } : {}),
      ...(retrievedAt ? { retrievedAt } : {}),
      ...(evaluation.severityMappingReview
        ? { mappingReview: evaluation.severityMappingReview }
        : {}),
      outdated,
      datasetMismatch,
      sourceMismatch,
      validCurrent:
        !historical && !outdated && !datasetMismatch && !sourceMismatch,
      historical,
    };
    addRecord(state, entry, sources);
    if (
      historical &&
      !records.some(
        (candidate) =>
          !candidate.historical &&
          candidate.record.recordStatus === 'current' &&
          candidate.record.sourceId === record.sourceId &&
          candidate.record.sourceVersion === record.sourceVersion,
      )
    )
      state.reasons.add('only-inactive-records');
  }
  return records;
}

/** A source that claims coverage it does not evidence invalidates the pair. */
function validateEvaluationSources(
  state: AssessmentState,
  sources: readonly PairSource[],
): void {
  for (const source of sources) {
    if (
      source.status === 'reported' &&
      !source.records.some((entry) => entry.validCurrent)
    ) {
      state.reasons.add('provider-pair-coverage-invalid');
      state.globalInvalidity = true;
    }
    if (source.status === 'covered-no-record' && source.records.length > 0) {
      state.reasons.add('provider-pair-coverage-invalid');
      state.globalInvalidity = true;
    }
  }
}

/** Current records and evidence links must agree in both directions. */
function validateEvaluationEvidenceLinks(
  state: AssessmentState,
  evaluation: InteractionEvaluation,
  records: readonly FilteredPairRecord[],
): void {
  const invalidEvidenceLink = records
    .filter(
      ({ record, historical }) =>
        !historical && record.recordStatus === 'current',
    )
    .some(({ record }) => {
      const evidence = evaluation.evidence.filter(
        (item) => item.interactionId === record.id,
      );
      return (
        record.evidenceIds.some(
          (id) => !evidence.some((item) => item.id === id),
        ) || evidence.some((item) => !record.evidenceIds.includes(item.id))
      );
    });
  if (invalidEvidenceLink) {
    state.reasons.add('evidence-link-invalid');
    state.globalInvalidity = true;
  }
}

/** Incomplete reasons that invalidate every pair, not just this one. */
const GLOBAL_INCOMPLETE_REASONS: ReadonlySet<InteractionIncompleteReason> =
  new Set<InteractionIncompleteReason>([
    'dataset-version-missing',
    'no-pairs-to-evaluate',
    'no-products-selected',
  ]);

function applyEvaluationIncompleteReasons(
  state: AssessmentState,
  evaluation: InteractionEvaluation,
): void {
  for (const reason of evaluation.incompleteReasons) {
    if (GLOBAL_INCOMPLETE_REASONS.has(reason)) {
      state.reasons.add(reason);
      state.globalInvalidity = true;
    }
  }
}

function addEvaluation(
  state: AssessmentState,
  evaluation: InteractionEvaluation,
  requestedKey: string,
): void {
  const rows = evaluation.evaluatedPairCoverage.filter((row) =>
    matchesPair(row.pair, requestedKey),
  );
  const inputs: EvaluationInputs = {
    evaluation,
    rows,
    descriptor: describeEvaluation(rows, evaluation),
  };
  const available = applyEvaluationFlags(state, evaluation);
  const sources = buildEvaluationSources(state, inputs, available);
  const records = ingestEvaluationRecords(state, inputs, sources, requestedKey);
  validateEvaluationSources(state, sources);
  validateEvaluationEvidenceLinks(state, evaluation, records);
  applyEvaluationIncompleteReasons(state, evaluation);
}

/**
 * A provider payload that fails structural validation is never partially
 * trusted. Its source is reported as unavailable with `provider-result-invalid`
 * and its coverage rows and records are skipped, so a malformed payload can
 * never throw or be read as safety.
 */
function markProviderResultInvalid(
  state: AssessmentState,
  result: unknown,
): void {
  state.providerUnavailable = true;
  state.reasons.add('provider-result-invalid');
  if (!isRecord(result)) return;
  const sourceId =
    typeof result.sourceId === 'string' ? result.sourceId : undefined;
  const sourceVersion =
    typeof result.sourceVersion === 'string' ? result.sourceVersion : undefined;
  if (!sourceId || !sourceVersion) return;
  const providerId =
    typeof result.providerId === 'string' ? result.providerId : undefined;
  createSource(state, {
    sourceId: sourceId as PairSource['sourceId'],
    sourceVersion,
    ...(providerId ? { providerId } : {}),
    hasCoverage: false,
    available: false,
    stale: false,
    invalidCoverage: false,
    reason: 'provider-result-invalid',
  });
}

function addMergedResults(
  state: AssessmentState,
  merged: MergedProviderResults,
  requestedKey: string,
): void {
  for (const result of merged.providerResults) {
    if (!isProviderResult(result)) {
      markProviderResultInvalid(state, result);
      continue;
    }
    const rows = result.pairCoverage.filter((row) =>
      matchesPair(row.pair, requestedKey),
    );
    const rowRecords = result.records.filter((record) =>
      matchesPair(
        canonicalPair(record.ingredientAId, record.ingredientBId),
        requestedKey,
      ),
    );
    const sources: PairSource[] = [];

    if (rows.length === 0) {
      const source = createSource(state, {
        sourceId: result.sourceId,
        sourceVersion: result.sourceVersion,
        providerId: result.providerId,
        hasCoverage: false,
        available: result.status === 'available',
        stale: false,
        invalidCoverage: false,
        ...(result.retrievedAt ? { retrievedAt: result.retrievedAt } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
      });
      if (source) sources.push(source);
      state.reasons.add('provider-pair-coverage-incomplete');
    } else {
      for (const row of rows) {
        const source = createSource(state, {
          sourceId: result.sourceId,
          sourceVersion: result.sourceVersion,
          providerId: result.providerId,
          status: row.status,
          hasCoverage: true,
          available: result.status === 'available',
          stale: row.stale === true,
          invalidCoverage: rows.length > 1,
          ...((row.retrievedAt ?? result.retrievedAt)
            ? { retrievedAt: row.retrievedAt ?? result.retrievedAt }
            : {}),
          ...(row.reason ? { reason: row.reason } : {}),
        });
        if (source) sources.push(source);
      }
      if (rows.length > 1) state.globalInvalidity = true;
    }

    if (result.status === 'unavailable')
      addUnavailableReason(state, result.reason);

    for (const record of rowRecords) {
      const outdated = record.sourceVersion !== result.sourceVersion;
      const sourceMismatch = record.sourceId !== result.sourceId;
      const historical = record.recordStatus !== 'current';
      const retrievedAt = recordRetrievedAt(
        record,
        result.evidence,
        result.retrievedAt,
      );
      addRecord(
        state,
        {
          record,
          providerId: result.providerId,
          ...(retrievedAt ? { retrievedAt } : {}),
          outdated,
          datasetMismatch: false,
          sourceMismatch,
          validCurrent: !historical && !outdated && !sourceMismatch,
          historical,
        },
        sources,
      );
    }

    for (const source of sources) {
      if (
        source.status === 'reported' &&
        !source.records.some((entry) => entry.validCurrent)
      ) {
        state.reasons.add('provider-pair-coverage-invalid');
        state.globalInvalidity = true;
      }
      if (source.status === 'covered-no-record' && source.records.length > 0) {
        state.reasons.add('provider-pair-coverage-invalid');
        state.globalInvalidity = true;
      }
      if (
        source.records.some((entry) => entry.historical) &&
        !source.records.some((entry) => entry.validCurrent)
      )
        state.reasons.add('only-inactive-records');
    }
  }

  state.evidenceConflict = merged.disagreements.some(
    (disagreement) =>
      matchesPair(disagreement.pair, requestedKey) &&
      disagreement.reasons.length > 0,
  );
}

function sourceIsComplete(source: PairSource): boolean {
  if (
    !source.available ||
    !source.hasCoverage ||
    source.stale ||
    source.invalidCoverage
  )
    return false;
  if (source.status === 'reported')
    return (
      source.records.some((entry) => entry.validCurrent) &&
      !source.records.some(
        (entry) =>
          entry.record.recordStatus === 'current' && !entry.validCurrent,
      )
    );
  if (source.status === 'covered-no-record') return source.records.length === 0;
  return false;
}

function sourcePosition(source: PairSource): PairAssessmentSourcePosition {
  // Only a valid current record documents the interaction. A current-status
  // record that is outdated or source/dataset mismatched is retained as
  // provenance, but it is neither a documenting position nor a negative
  // finding for its source. A covered source with no records reports only
  // the absence of a record in its evaluated coverage, never an affirmative
  // claim that no interaction exists.
  if (source.records.some((entry) => entry.validCurrent))
    return 'documents-interaction';
  if (source.records.length > 0) return 'no-coverage';
  if (!source.available) return 'unavailable';
  if (
    source.status === 'covered-no-record' &&
    !source.stale &&
    !source.invalidCoverage
  )
    return 'no-record-in-coverage';
  return 'no-coverage';
}

function createPositions(
  state: AssessmentState,
): PairAssessment['evidence']['positions'] {
  const positions: PairAssessment['evidence']['positions'][number][] =
    state.sources.map((source) => ({
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      position: sourcePosition(source),
    }));
  for (const entry of state.records) {
    if (state.sources.some((source) => recordMatchesSource(entry, source)))
      continue;
    positions.push({
      sourceId: entry.record.sourceId,
      sourceVersion: entry.record.sourceVersion,
      position: entry.validCurrent ? 'documents-interaction' : 'no-coverage',
    });
  }
  const unique = new Map<string, (typeof positions)[number]>();
  for (const position of positions)
    unique.set(
      JSON.stringify([
        position.sourceId,
        position.sourceVersion,
        position.position,
      ]),
      position,
    );
  return [...unique.values()].sort(
    (left, right) =>
      compareStrings(left.sourceId, right.sourceId) ||
      compareStrings(left.sourceVersion, right.sourceVersion) ||
      compareStrings(left.position, right.position),
  );
}

function sourceSeverity(
  entry: AssessmentRecord,
): PairAssessment['finding']['sourceSeverities'][number] {
  const { record, mappingReview } = entry;
  const severity: {
    sourceId: DrugInteraction['sourceId'];
    sourceVersion: string;
    recordId: string;
    severityTerm?: string;
    normalizedSeverity?: string | 'unmapped';
    severityMappingReviewed?: boolean;
  } = {
    sourceId: record.sourceId,
    sourceVersion: record.sourceVersion,
    recordId: record.id,
    ...(record.severity !== undefined ? { severityTerm: record.severity } : {}),
  };
  if (
    mappingReview?.reviewed === true &&
    record.severityMappingReviewed === true &&
    record.severityMappingVersion === mappingReview.mappingVersion
  ) {
    severity.severityMappingReviewed = true;
    if (record.normalizedSeverity !== undefined)
      severity.normalizedSeverity = record.normalizedSeverity;
  } else if (
    mappingReview?.reviewed === false &&
    record.severityMappingReviewed === false &&
    record.severityMappingVersion === mappingReview.mappingVersion
  ) {
    severity.severityMappingReviewed = false;
  }
  return severity;
}

function hasCrossSourceSeverityConflict(
  records: readonly AssessmentRecord[],
): boolean {
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex]?.record;
    if (!left || left.severity === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < records.length;
      rightIndex += 1
    ) {
      const right = records[rightIndex]?.record;
      if (
        right &&
        right.sourceId !== left.sourceId &&
        right.severity !== undefined &&
        right.severity !== left.severity
      )
        return true;
    }
  }
  return false;
}

function assessmentStatus(
  state: AssessmentState,
): PairAssessment['coverage']['status'] {
  if (state.truncated) return 'truncated';
  if (state.unresolved) return 'inputs-unresolved';
  if (state.providerUnavailable) return 'unavailable';
  if (state.sources.some((source) => !source.available)) return 'unavailable';
  if (state.sources.some((source) => source.status === 'unsupported-context'))
    return 'unsupported-context';
  if (
    state.sources.length === 0 ||
    state.sources.some((source) => !sourceIsComplete(source))
  )
    return 'not-covered';
  return 'covered';
}

function freezeTree<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) freezeTree(child);
  return Object.freeze(value);
}

function createAssessmentState(): AssessmentState {
  return {
    records: [],
    sources: [],
    reasons: new Set<string>(),
    unresolved: false,
    truncated: false,
    globalInvalidity: false,
    providerUnavailable: false,
    evidenceConflict: false,
  };
}

/** A merged result and an evaluation list are ingested the same way. */
function ingestAssessmentInput(
  state: AssessmentState,
  input: PairAssessmentInput,
  requestedKey: string,
): void {
  if (!Array.isArray(input) && 'providerResults' in input)
    addMergedResults(state, input, requestedKey);
  else
    for (const evaluation of Array.isArray(input) ? input : [input])
      addEvaluation(state, evaluation, requestedKey);
}

interface AssessmentRecordSets {
  readonly current: readonly AssessmentRecord[];
  readonly historical: readonly AssessmentRecord[];
  readonly outdated: readonly AssessmentRecord[];
}

function collectRecordSets(state: AssessmentState): AssessmentRecordSets {
  return {
    current: state.records.filter((entry) => entry.validCurrent),
    historical: state.records.filter((entry) => entry.historical),
    outdated: state.records.filter((entry) => entry.outdated),
  };
}

/**
 * Coverage is complete only when every source is complete, nothing invalidated
 * the pair, and no retained record is outdated or source/dataset mismatched.
 */
function isCoverageComplete(
  state: AssessmentState,
  status: PairAssessment['coverage']['status'],
): boolean {
  return (
    status === 'covered' &&
    state.sources.every(sourceIsComplete) &&
    !state.globalInvalidity &&
    !state.records.some(
      (entry) =>
        entry.outdated || entry.datasetMismatch || entry.sourceMismatch,
    )
  );
}

function createSourceSeverities(
  state: AssessmentState,
): PairAssessment['finding']['sourceSeverities'] {
  return state.records
    .map(sourceSeverity)
    .sort(
      (left, right) =>
        compareStrings(left.sourceId, right.sourceId) ||
        compareStrings(left.sourceVersion, right.sourceVersion) ||
        compareStrings(left.recordId, right.recordId) ||
        compareStrings(left.severityTerm ?? '', right.severityTerm ?? ''),
    );
}

function createEvidenceLevels(
  state: AssessmentState,
): PairAssessment['evidence']['evidenceLevels'] {
  return state.records
    .map(({ record }) => ({
      sourceId: record.sourceId,
      recordId: record.id,
      ...(record.evidenceLevel !== undefined
        ? { evidenceLevel: record.evidenceLevel }
        : {}),
    }))
    .sort(
      (left, right) =>
        compareStrings(left.sourceId, right.sourceId) ||
        compareStrings(left.recordId, right.recordId) ||
        compareStrings(left.evidenceLevel ?? '', right.evidenceLevel ?? ''),
    );
}

function createProvenance(
  state: AssessmentState,
): PairAssessment['provenance'] {
  return state.records
    .map(({ record, retrievedAt }) => ({
      sourceId: record.sourceId,
      sourceVersion: record.sourceVersion,
      recordId: record.id,
      datasetVersionId: record.datasetVersionId,
      ...(retrievedAt ? { retrievedAt } : {}),
    }))
    .sort(
      (left, right) =>
        compareStrings(left.sourceId, right.sourceId) ||
        compareStrings(left.sourceVersion, right.sourceVersion) ||
        compareStrings(left.recordId, right.recordId) ||
        compareStrings(left.datasetVersionId, right.datasetVersionId) ||
        compareStrings(left.retrievedAt ?? '', right.retrievedAt ?? ''),
    );
}

/** Reasons that only become visible once every source has been ingested. */
function applyAssessmentReasons(
  state: AssessmentState,
  sets: AssessmentRecordSets,
): void {
  if (sets.outdated.length > 0)
    state.reasons.add('outdated-record-source-version');
  if (sets.historical.length > 0 && sets.current.length === 0)
    state.reasons.add('only-inactive-records');
  if (
    state.sources.some(
      (source) =>
        source.available &&
        source.hasCoverage &&
        !source.stale &&
        !source.invalidCoverage &&
        (source.status === 'reported' ||
          source.status === 'covered-no-record') &&
        !sourceIsComplete(source),
    )
  )
    state.reasons.add('provider-pair-coverage-invalid');
}

function createFindingDimension(
  sets: AssessmentRecordSets,
  sourceSeverities: PairAssessment['finding']['sourceSeverities'],
): PairAssessment['finding'] {
  return {
    documentedInteraction: sets.current.length > 0,
    sourceSeverities,
  };
}

function createEvidenceDimension(
  state: AssessmentState,
  sets: AssessmentRecordSets,
  positions: PairAssessment['evidence']['positions'],
  evidenceLevels: PairAssessment['evidence']['evidenceLevels'],
): PairAssessment['evidence'] {
  const crossSourceSeverityConflict = hasCrossSourceSeverityConflict(
    sets.current,
  );
  // A documented record beside a covered-no-record source is a disagreement
  // in what sources hold, not a negative finding: absence of a record is
  // never an affirmative claim that no interaction exists.
  const hasPositionConflict =
    positions.some((item) => item.position === 'documents-interaction') &&
    positions.some((item) => item.position === 'no-record-in-coverage');
  return {
    evidenceConflict:
      state.evidenceConflict ||
      hasPositionConflict ||
      crossSourceSeverityConflict,
    positions,
    sourceStatedUncertainty: state.records.some(
      ({ record }) => record.sourceStatesUncertainEvidence === true,
    ),
    evidenceLevels,
  };
}

function recordIds(records: readonly AssessmentRecord[]): string[] {
  return [...new Set(records.map(({ record }) => record.id))].sort(
    compareStrings,
  );
}

function createCurrencyDimension(
  sets: AssessmentRecordSets,
): PairAssessment['currency'] {
  return {
    currentRecordIds: recordIds(sets.current),
    historicalRecordIds: recordIds(sets.historical),
    outdatedRecordIds: recordIds(sets.outdated),
  };
}

function createAssessment(
  input: PairAssessmentInput,
  requestedPair: CanonicalIngredientPair,
): PairAssessment {
  const pair = canonicalPair(requestedPair[0], requestedPair[1]);
  const state = createAssessmentState();
  ingestAssessmentInput(state, input, pairKey(pair));

  const sets = collectRecordSets(state);
  const status = assessmentStatus(state);
  const coverageComplete = isCoverageComplete(state, status);
  const positions = createPositions(state);
  applyAssessmentReasons(state, sets);

  return freezeTree({
    pair,
    logicVersion: INTERACTION_ASSESSMENT_LOGIC_VERSION,
    finding: createFindingDimension(sets, createSourceSeverities(state)),
    evidence: createEvidenceDimension(
      state,
      sets,
      positions,
      createEvidenceLevels(state),
    ),
    currency: createCurrencyDimension(sets),
    coverage: {
      status,
      coverageComplete,
      reasons: [...state.reasons].sort(compareStrings),
    },
    provenance: createProvenance(state),
  });
}

/** Assess one ingredient pair while preserving its source-level evidence. */
export function assessInteractionPair(
  input: PairAssessmentInput,
  pair: CanonicalIngredientPair,
): PairAssessment {
  return createAssessment(input, pair);
}
