import {
  BMI_FORMULA,
  MOSTELLER_BSA_FORMULA,
  FormulaRegistry,
  pendingApprovals,
} from '@intermed/domain';

// Report the bundled candidates and their exact component approvals.
// Registering metadata here does not evaluate a formula or grant approval.
const registry = new FormulaRegistry();
export const diagnosticFormulas = [BMI_FORMULA, MOSTELLER_BSA_FORMULA] as const;
diagnosticFormulas.forEach((formula) => registry.register(formula));
export const diagnosticPendingApprovals = pendingApprovals(registry);
