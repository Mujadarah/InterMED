import type { FormulaRegistry } from './registry';
import type {
  FormulaApprovalRecord,
  FormulaComponent,
  FormulaComponentVersions,
  PendingFormulaApproval,
} from './types';

/**
 * Clinical approvals are owner-managed evidence. Records are added only after
 * the owner explicitly approves an exact component version.
 */
export const FORMULA_APPROVALS: readonly FormulaApprovalRecord[] =
  Object.freeze([
    Object.freeze({
      formulaId: 'bmi',
      component: 'formula',
      componentVersion: '1.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bmi',
      component: 'population',
      componentVersion: '2.1.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bmi',
      component: 'classification',
      componentVersion: '2.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bmi',
      component: 'presentation',
      componentVersion: '2.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bmi',
      component: 'confirmation',
      componentVersion: '1.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bsa-mosteller',
      component: 'formula',
      componentVersion: '1.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bsa-mosteller',
      component: 'population',
      componentVersion: '2.1.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bsa-mosteller',
      component: 'presentation',
      componentVersion: '2.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
    Object.freeze({
      formulaId: 'bsa-mosteller',
      component: 'confirmation',
      componentVersion: '1.0.0',
      approvedBy: 'Project owner (surgeon, clinical reviewer)',
      approvedOn: '2026-10-14',
      scope:
        'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only',
    }),
  ]);

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
