import type {
  CanonicalIngredientPair,
  DrugInteraction,
  InteractionDisagreement,
  InteractionDisagreementReason,
  InteractionDisagreementTerm,
  InteractionEvidence,
  InteractionIncompleteReason,
  InteractionSourceVersion,
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

function severityTermsDifferAcrossProviders(
  terms: readonly InteractionDisagreementTerm[],
): boolean {
  for (let left = 0; left < terms.length; left += 1) {
    const leftTerm = terms[left];
    if (!leftTerm) continue;
    for (let right = left + 1; right < terms.length; right += 1) {
      const rightTerm = terms[right];
      if (!rightTerm) continue;
      if (
        leftTerm.providerId !== rightTerm.providerId &&
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

function hasReportedVsCoveredDisagreement(finding: PairFindings): boolean {
  const reportedProviderIndexes = new Set(
    finding.reports
      .filter((report) => report.status === 'reported')
      .map((report) => report.providerIndex),
  );
  const noRecordProviderIndexes = new Set(
    finding.reports
      .filter((report) => report.status === 'covered-no-record')
      .map((report) => report.providerIndex),
  );
  return [...reportedProviderIndexes].some((index) =>
    [...noRecordProviderIndexes].some((otherIndex) => otherIndex !== index),
  );
}

function deriveDisagreements(
  findings: ReadonlyMap<string, PairFindings>,
): InteractionDisagreement[] {
  const disagreements: InteractionDisagreement[] = [];
  for (const finding of findings.values()) {
    const reasons: InteractionDisagreementReason[] = [];
    if (severityTermsDifferAcrossProviders(finding.terms))
      reasons.push('severity-terms-differ');
    if (hasReportedVsCoveredDisagreement(finding))
      reasons.push('reported-vs-covered-no-record');
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

/**
 * Merge provider payloads without creating a combined severity or verdict.
 * The tuple type and runtime guard require results from at least two providers.
 *
 * A malformed payload is retained in `providerResults` so the assessment can
 * report that source as unavailable, but it contributes no records, evidence,
 * source versions or disagreements to the merge.
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
  return {
    providerResults,
    records: collectMergedRecords(usableResults),
    evidence: usableResults.flatMap((result) => result.evidence),
    sourceVersions: collectMergedSourceVersions(usableResults),
    disagreements: deriveDisagreements(findings),
  };
}
