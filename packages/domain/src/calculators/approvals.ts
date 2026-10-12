import type { FormulaRegistry } from './registry';
import type {
  FormulaApprovalRecord,
  FormulaReviewStatus,
  PendingFormulaApproval,
} from './types';

type ClinicallyReviewedStatus = Extract<
  FormulaReviewStatus,
  { readonly status: 'clinically-reviewed' }
>;

/**
 * Clinical approvals are owner-managed evidence. Keep this list empty until
 * an owner adds a scoped record for an exact formula id and version.
 */
export const FORMULA_APPROVALS: readonly FormulaApprovalRecord[] =
  Object.freeze([]);

export function hasFormulaApproval(
  formulaId: string,
  formulaVersion: string,
  reviewStatus: ClinicallyReviewedStatus,
): boolean {
  return FORMULA_APPROVALS.some(
    (record) =>
      record.formulaId === formulaId &&
      record.formulaVersion === formulaVersion &&
      record.approvedBy === reviewStatus.reviewer &&
      record.approvedOn === reviewStatus.reviewedAt &&
      typeof record.scope === 'string' &&
      record.scope.trim().length > 0,
  );
}

export function pendingApprovals(
  registry: FormulaRegistry,
): readonly PendingFormulaApproval[] {
  return registry.listPendingApprovals();
}
