import type { FormulaRegistry } from './registry';
import type {
  FormulaApprovalRecord,
  FormulaComponent,
  FormulaComponentVersions,
  PendingFormulaApproval,
} from './types';

/**
 * Clinical approvals are owner-managed evidence. Keep this list empty until
 * an owner adds scoped records for the exact component versions.
 */
export const FORMULA_APPROVALS: readonly FormulaApprovalRecord[] =
  Object.freeze([]);

export function hasFormulaApproval(
  formulaId: string,
  componentVersions: FormulaComponentVersions,
): boolean {
  return Object.entries(componentVersions).every(
    ([component, componentVersion]) =>
      typeof componentVersion === 'string' &&
      hasComponentApproval(
        formulaId,
        component as FormulaComponent,
        componentVersion,
      ),
  );
}

export function hasComponentApproval(
  formulaId: string,
  component: FormulaComponent,
  componentVersion: string,
): boolean {
  return FORMULA_APPROVALS.some(
    (record) =>
      record.formulaId === formulaId &&
      record.component === component &&
      record.componentVersion === componentVersion &&
      typeof record.approvedBy === 'string' &&
      record.approvedBy.trim().length > 0 &&
      typeof record.approvedOn === 'string' &&
      Number.isFinite(Date.parse(record.approvedOn)) &&
      typeof record.scope === 'string' &&
      record.scope.trim().length > 0,
  );
}

export function pendingApprovals(
  registry: FormulaRegistry,
): readonly PendingFormulaApproval[] {
  return registry.listPendingApprovals();
}
