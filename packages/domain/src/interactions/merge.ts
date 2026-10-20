import type {
  CanonicalIngredientPair,
  DrugInteraction,
  InteractionCoverageDiscrepancy,
  InteractionCoverageDiscrepancySource,
  InteractionDisagreement,
  InteractionDisagreementReason,
  InteractionDisagreementTerm,
  InteractionEvidence,
  InteractionIncompleteReason,
  InteractionSourceVersion,
  InteractionWithinSourceInconsistency,
  InteractionWithinSourceInconsistencyEntry,
  InteractionWithinSourceInconsistencyReason,
  MergedProviderResults,
  PairCoverageStatus,
  ProviderResult,
} from './types';
import {
  addIncompleteReason,
  addSourceVersion,
  canonicalPair,
  compareStrings,
  pairKey,
} from './pairs';
import { isProviderResult } from './provider-result';

interface PairFindings {
  readonly pair: CanonicalIngredientPair;
  readonly terms: InteractionDisagreementTerm[];
  readonly reports: {
    readonly providerIndex: number;
    readonly status: PairCoverageStatus;
  }[];
}

function addDisagreementTerm(
  target: InteractionDisagreementTerm[],
  providerResult: ProviderResult,
  severity: string | undefined,
): void {
  if (severity === undefined) return;
  target.push({
    providerId: providerResult.providerId,
    sourceId: providerResult.sourceId,
    sourceVersion: providerResult.sourceVersion,
    severity,
  });
}

function severityTermsDifferAcrossSources(
  terms: readonly InteractionDisagreementTerm[],
): boolean {
  for (let left = 0; left < terms.length; left += 1) {
    const leftTerm = terms[left];
    if (!leftTerm) continue;
    for (let right = left + 1; right < terms.length; right += 1) {
      const rightTerm = terms[right];
      if (!rightTerm) continue;
      if (
        leftTerm.sourceId !== rightTerm.sourceId &&
        leftTerm.severity !== rightTerm.severity
      )
        return true;
    }
  }
  return false;
}

function collectPairFindings(
  providerResults: readonly ProviderResult[],
): Map<string, PairFindings> {
  const findings = new Map<string, PairFindings>();
  const getFinding = (pair: CanonicalIngredientPair): PairFindings => {
    const key = pairKey(pair);
    const existing = findings.get(key);
    if (existing) return existing;
    const created: PairFindings = { pair, terms: [], reports: [] };
    findings.set(key, created);
    return created;
  };

  for (
    let providerIndex = 0;
    providerIndex < providerResults.length;
    providerIndex += 1
  ) {
    const result = providerResults[providerIndex];
    if (!result) continue;
    for (const record of result.records) {
      if (
        record.recordStatus !== 'current' ||
        record.sourceVersion !== result.sourceVersion
      )
        continue;
      const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
      const finding = getFinding(pair);
      addDisagreementTerm(finding.terms, result, record.severity);
    }
    for (const coverage of result.pairCoverage) {
      const pair = canonicalPair(coverage.pair[0], coverage.pair[1]);
      const pairKeyValue = pairKey(pair);
      const pairRecords = result.records.filter(
        (record) =>
          pairKey(canonicalPair(record.ingredientAId, record.ingredientBId)) ===
          pairKeyValue,
      );
      const hasCurrentRecord = pairRecords.some(
        (record) =>
          record.recordStatus === 'current' &&
          record.sourceVersion === result.sourceVersion,
      );
      const hasInactiveOrOutdatedRecord = pairRecords.some(
        (record) =>
          record.recordStatus !== 'current' ||
          record.sourceVersion !== result.sourceVersion,
      );
      const onlyInactiveOrOutdatedRecords =
        !hasCurrentRecord && hasInactiveOrOutdatedRecord;
      const status =
        onlyInactiveOrOutdatedRecords ||
        (coverage.status === 'reported' && !hasCurrentRecord)
          ? 'not-covered'
          : coverage.status;
      getFinding(pair).reports.push({ providerIndex, status });
    }
  }
  return findings;
}

function deriveDisagreements(
  findings: ReadonlyMap<string, PairFindings>,
): InteractionDisagreement[] {
  const disagreements: InteractionDisagreement[] = [];
  for (const finding of findings.values()) {
    const reasons: InteractionDisagreementReason[] = [];
    if (severityTermsDifferAcrossSources(finding.terms))
      reasons.push('severity-terms-differ');
    if (reasons.length > 0)
      disagreements.push({
        pair: finding.pair,
        reasons,
        severityTerms: finding.terms,
      });
  }
  return disagreements.sort((left, right) =>
    compareStrings(pairKey(left.pair), pairKey(right.pair)),
  );
}

function toCoverageSource(
  providerResults: readonly ProviderResult[],
  providerIndex: number,
): InteractionCoverageDiscrepancySource | undefined {
  const result = providerResults[providerIndex];
  if (!result) return undefined;
  return {
    providerId: result.providerId,
    sourceId: result.sourceId,
    sourceVersion: result.sourceVersion,
  };
}

function compareCoverageSources(
  left: InteractionCoverageDiscrepancySource,
  right: InteractionCoverageDiscrepancySource,
): number {
  return (
    compareStrings(left.providerId, right.providerId) ||
    compareStrings(left.sourceId, right.sourceId) ||
    compareStrings(left.sourceVersion, right.sourceVersion)
  );
}

/**
 * A coverage discrepancy records that one source documents an interaction
 * while another source covers the same pair with no record. Absence of a
 * record is a neutral observation about that source's coverage, never
 * clinical evidence against the documented finding, so it is kept separate
 * from `disagreements`, which hold only clinical evidence disagreements
 * (today `severity-terms-differ`).
 */
function deriveCoverageDiscrepancies(
  findings: ReadonlyMap<string, PairFindings>,
  providerResults: readonly ProviderResult[],
): InteractionCoverageDiscrepancy[] {
  const discrepancies: InteractionCoverageDiscrepancy[] = [];
  for (const finding of findings.values()) {
    const documentingIndexes = [
      ...new Set(
        finding.reports
          .filter((report) => report.status === 'reported')
          .map((report) => report.providerIndex),
      ),
    ];
    const noRecordIndexes = [
      ...new Set(
        finding.reports
          .filter((report) => report.status === 'covered-no-record')
          .map((report) => report.providerIndex),
      ),
    ];
    const sourceIdOf = (index: number): string | undefined =>
      providerResults[index]?.sourceId;
    const hasCrossSourcePair = documentingIndexes.some((index) =>
      noRecordIndexes.some(
        (otherIndex) =>
          index !== otherIndex && sourceIdOf(index) !== sourceIdOf(otherIndex),
      ),
    );
    if (!hasCrossSourcePair) continue;
    const crossDocumentingIndexes = documentingIndexes.filter((index) =>
      noRecordIndexes.some(
        (otherIndex) =>
          index !== otherIndex && sourceIdOf(index) !== sourceIdOf(otherIndex),
      ),
    );
    const crossNoRecordIndexes = noRecordIndexes.filter((index) =>
      documentingIndexes.some(
        (otherIndex) =>
          index !== otherIndex && sourceIdOf(index) !== sourceIdOf(otherIndex),
      ),
    );
    const documentingSources = crossDocumentingIndexes
      .map((index) => toCoverageSource(providerResults, index))
      .filter((entry) => entry !== undefined)
      .sort(compareCoverageSources);
    const noRecordSources = crossNoRecordIndexes
      .map((index) => toCoverageSource(providerResults, index))
      .filter((entry) => entry !== undefined)
      .sort(compareCoverageSources);
    if (documentingSources.length === 0 || noRecordSources.length === 0)
      continue;
    discrepancies.push({
      pair: finding.pair,
      documentingSources,
      noRecordSources,
    });
  }
  return discrepancies.sort((left, right) =>
    compareStrings(pairKey(left.pair), pairKey(right.pair)),
  );
}

function hasCurrentRecordForPair(
  providerResults: readonly ProviderResult[],
  providerIndex: number,
  pair: CanonicalIngredientPair,
): boolean {
  const result = providerResults[providerIndex];
  if (!result) return false;
  const key = pairKey(pair);
  return result.records.some(
    (record) =>
      record.recordStatus === 'current' &&
      record.sourceVersion === result.sourceVersion &&
      pairKey(canonicalPair(record.ingredientAId, record.ingredientBId)) ===
        key,
  );
}

function severitiesForProviderIndex(
  providerResults: readonly ProviderResult[],
  providerIndex: number,
  pair: CanonicalIngredientPair,
): string[] {
  const result = providerResults[providerIndex];
  if (!result) return [];
  const key = pairKey(pair);
  const severities = result.records
    .filter(
      (record) =>
        record.recordStatus === 'current' &&
        record.sourceVersion === result.sourceVersion &&
        pairKey(canonicalPair(record.ingredientAId, record.ingredientBId)) ===
          key &&
        record.severity !== undefined,
    )
    .map((record) => record.severity as string);
  return [...new Set(severities)].sort(compareStrings);
}

function statusesForProviderIndex(
  finding: PairFindings,
  providerIndex: number,
): PairCoverageStatus[] {
  const statuses = finding.reports
    .filter((report) => report.providerIndex === providerIndex)
    .map((report) => report.status);
  return [...new Set(statuses)];
}

function compareWithinSourceEntries(
  left: InteractionWithinSourceInconsistencyEntry,
  right: InteractionWithinSourceInconsistencyEntry,
): number {
  return (
    compareStrings(left.providerId, right.providerId) ||
    compareStrings(left.sourceId, right.sourceId) ||
    compareStrings(left.sourceVersion, right.sourceVersion) ||
    compareStrings(left.status, right.status) ||
    compareStrings(left.severity ?? '', right.severity ?? '')
  );
}

function deriveWithinSourceInconsistencies(
  findings: ReadonlyMap<string, PairFindings>,
  providerResults: readonly ProviderResult[],
): InteractionWithinSourceInconsistency[] {
  const inconsistencies: InteractionWithinSourceInconsistency[] = [];
  for (const finding of findings.values()) {
    const sourceIds = [
      ...new Set(
        [
          ...finding.terms.map((term) => term.sourceId),
          ...finding.reports.map(
            (report) => providerResults[report.providerIndex]?.sourceId,
          ),
        ].filter((value) => value !== undefined),
      ),
    ].sort(compareStrings);
    for (const sourceId of sourceIds) {
      const termsForSource = finding.terms.filter(
        (term) => term.sourceId === sourceId,
      );
      const indexesForSource = [
        ...new Set(
          finding.reports
            .filter(
              (report) =>
                providerResults[report.providerIndex]?.sourceId === sourceId,
            )
            .map((report) => report.providerIndex),
        ),
      ];
      const recordIndexesForSource = providerResults
        .map((result, index) => ({ result, index }))
        .filter(
          ({ result, index }) =>
            result.sourceId === sourceId &&
            hasCurrentRecordForPair(providerResults, index, finding.pair),
        )
        .map(({ index }) => index);
      const allIndexes = [
        ...new Set([...indexesForSource, ...recordIndexesForSource]),
      ].sort((left, right) => left - right);
      if (allIndexes.length === 0) continue;

      const hasSeverityDifference = termsForSource.some((left, leftPos) =>
        termsForSource
          .slice(leftPos + 1)
          .some(
            (right) =>
              right.severity !== left.severity &&
              (right.providerId !== left.providerId ||
                right.sourceVersion !== left.sourceVersion),
          ),
      );
      const statusesByIndex = new Map<number, PairCoverageStatus[]>(
        allIndexes.map((index) => [
          index,
          statusesForProviderIndex(finding, index),
        ]),
      );
      const reportedIdentities = new Set(
        allIndexes
          // A provider reports the pair through a coverage row or through a
          // current record for it, matching how the assessment counts it.
          .filter(
            (index) =>
              statusesByIndex.get(index)?.includes('reported') ||
              hasCurrentRecordForPair(providerResults, index, finding.pair),
          )
          .map((index) => {
            const result = providerResults[index];
            return JSON.stringify([result?.providerId, result?.sourceVersion]);
          }),
      );
      const noRecordIdentities = new Set(
        allIndexes
          .filter((index) =>
            statusesByIndex.get(index)?.includes('covered-no-record'),
          )
          .map((index) => {
            const result = providerResults[index];
            return JSON.stringify([result?.providerId, result?.sourceVersion]);
          }),
      );
      const hasReportedVsNoRecord = [...reportedIdentities].some((reported) =>
        [...noRecordIdentities].some((noRecord) => noRecord !== reported),
      );

      const reasons: InteractionWithinSourceInconsistencyReason[] = [];
      if (hasReportedVsNoRecord) reasons.push('reported-vs-covered-no-record');
      if (hasSeverityDifference) reasons.push('severity-terms-differ');
      reasons.sort(compareStrings);
      if (reasons.length === 0) continue;

      const entryMap = new Map<
        string,
        InteractionWithinSourceInconsistencyEntry
      >();
      for (const index of allIndexes) {
        const result = providerResults[index];
        if (!result) continue;
        const statuses = statusesByIndex.get(index) ?? [];
        const severities = severitiesForProviderIndex(
          providerResults,
          index,
          finding.pair,
        );
        const effectiveStatuses: PairCoverageStatus[] =
          statuses.length > 0
            ? statuses
            : severities.length > 0
              ? (['reported'] as PairCoverageStatus[])
              : [];
        if (effectiveStatuses.length === 0) continue;
        const effectiveSeverities: (string | undefined)[] =
          severities.length > 0 ? severities : [undefined];
        for (const status of effectiveStatuses) {
          for (const severity of effectiveSeverities) {
            const entry: InteractionWithinSourceInconsistencyEntry = {
              providerId: result.providerId,
              sourceId: result.sourceId,
              sourceVersion: result.sourceVersion,
              status,
              ...(severity !== undefined ? { severity } : {}),
            };
            entryMap.set(
              JSON.stringify([
                entry.providerId,
                entry.sourceId,
                entry.sourceVersion,
                entry.status,
                entry.severity ?? '',
              ]),
              entry,
            );
          }
        }
      }
      const entries = [...entryMap.values()].sort(compareWithinSourceEntries);
      if (entries.length === 0) continue;
      inconsistencies.push({
        pair: finding.pair,
        sourceId,
        reasons,
        entries,
      });
    }
  }
  return inconsistencies.sort(
    (left, right) =>
      compareStrings(pairKey(left.pair), pairKey(right.pair)) ||
      compareStrings(left.sourceId, right.sourceId),
  );
}

function collectMergedRecords(
  providerResults: readonly ProviderResult[],
): MergedProviderResults['records'] {
  return providerResults.flatMap((result) =>
    result.records.map((record) => {
      const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
      return {
        ...record,
        ingredientAId: pair[0],
        ingredientBId: pair[1],
      };
    }),
  );
}

export function collectLinkedEvidence(
  result: ProviderResult,
  validRecords: readonly DrugInteraction[],
  reasonSet: Set<InteractionIncompleteReason>,
): InteractionEvidence[] {
  const recordById = new Map(validRecords.map((record) => [record.id, record]));
  const evidence: InteractionEvidence[] = [];
  for (const item of result.evidence) {
    const record = recordById.get(item.interactionId);
    if (record?.evidenceIds.includes(item.id)) evidence.push(item);
    else addIncompleteReason(reasonSet, 'evidence-link-invalid');
  }
  const linkedEvidenceIds = new Set(evidence.map((item) => item.id));
  for (const record of validRecords) {
    if (
      record.evidenceIds.some(
        (evidenceId) => !linkedEvidenceIds.has(evidenceId),
      )
    )
      addIncompleteReason(reasonSet, 'evidence-link-invalid');
  }
  return evidence;
}

function collectMergedSourceVersions(
  providerResults: readonly ProviderResult[],
): InteractionSourceVersion[] {
  const sourceVersions: InteractionSourceVersion[] = [];
  for (const result of providerResults) {
    addSourceVersion(sourceVersions, {
      providerId: result.providerId,
      sourceId: result.sourceId,
      sourceVersion: result.sourceVersion,
    });
    for (const record of result.records)
      addSourceVersion(sourceVersions, {
        providerId: result.providerId,
        sourceId: record.sourceId,
        sourceVersion: record.sourceVersion,
      });
  }
  return sourceVersions;
}

function freezeMerged<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) freezeMerged(child);
  return Object.freeze(value);
}

/**
 * Merge provider payloads without creating a combined severity or verdict.
 * The tuple type and runtime guard require results from at least two providers.
 *
 * A malformed payload is retained in `providerResults` so the assessment can
 * report that source as unavailable, but it contributes no records, evidence,
 * source versions, disagreements or coverage discrepancies to the merge.
 */
export function mergeProviderResults(
  providerResults: readonly [
    ProviderResult,
    ProviderResult,
    ...ProviderResult[],
  ],
): MergedProviderResults {
  if (providerResults.length < 2)
    throw new RangeError('At least two provider results are required.');

  const usableResults = providerResults.filter(isProviderResult);
  const findings = collectPairFindings(usableResults);
  return freezeMerged({
    providerResults,
    records: collectMergedRecords(usableResults),
    evidence: usableResults.flatMap((result) => result.evidence),
    sourceVersions: collectMergedSourceVersions(usableResults),
    disagreements: deriveDisagreements(findings),
    coverageDiscrepancies: deriveCoverageDiscrepancies(findings, usableResults),
    withinSourceInconsistencies: deriveWithinSourceInconsistencies(
      findings,
      usableResults,
    ),
  });
}
