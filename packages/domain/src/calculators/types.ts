export type FormulaQuantityKind = string;

export interface FormulaReference {
  readonly citation: string;
  readonly urlOrDoi: string;
}

export type FormulaReviewStatus =
  | 'unreviewed'
  | {
      readonly status: 'clinically-reviewed';
      readonly reviewer: string;
      readonly reviewedAt: string;
    };

export interface FormulaDeprecation {
  readonly notice: string;
}

export interface FormulaInputDefinition {
  readonly id: string;
  readonly label: string;
  readonly quantityKind: FormulaQuantityKind;
  /** Unit used by population guards and passed to `compute`. */
  readonly canonicalUnit: string;
  readonly allowedUnits: readonly string[];
  readonly plausibleRangeByUnit: Readonly<
    Record<string, { readonly min: number; readonly max: number }>
  >;
  readonly required: boolean;
  readonly allowNegative?: boolean;
}

export interface UnitConversionRule {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly factor: number;
  readonly offset?: number;
}

export type FormulaUnitConversions = Readonly<
  Record<FormulaQuantityKind, readonly UnitConversionRule[]>
>;

export type PopulationGuard =
  | {
      readonly id: string;
      readonly inputId: string;
      readonly operator: 'between';
      readonly minimum: number;
      readonly maximum: number;
      readonly unit: string;
      readonly message: string;
    }
  | {
      readonly id: string;
      readonly inputId: string;
      readonly operator: 'at-least';
      readonly value: number;
      readonly unit: string;
      readonly message: string;
    }
  | {
      readonly id: string;
      readonly inputId: string;
      readonly operator: 'at-most';
      readonly value: number;
      readonly unit: string;
      readonly message: string;
    };

export interface FormulaPopulationLimits {
  readonly text: string;
  readonly guards: readonly PopulationGuard[];
}

export interface FormulaOutputDefinition {
  readonly unit: string;
  readonly precision: number;
}

export interface FormulaDefinition {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly title: string;
  readonly primaryReference: FormulaReference;
  readonly inputs: readonly FormulaInputDefinition[];
  /** Formula-specific conversion rules, grouped by quantity kind. */
  readonly unitConversions: FormulaUnitConversions;
  readonly output: FormulaOutputDefinition;
  readonly populationLimits: FormulaPopulationLimits;
  readonly limitations: readonly string[];
  readonly reviewStatus: FormulaReviewStatus;
  readonly deprecated?: FormulaDeprecation;
  /** Pure, synchronous calculation over values normalized to canonical units. */
  compute(values: Readonly<Record<string, number | undefined>>): number;
}

export interface FormulaVersionSummary {
  readonly version: string;
  readonly deprecated: boolean;
  readonly deprecationNotice?: string;
}

export interface CalculationInput {
  readonly value: number;
  readonly unit: string;
}

export interface CalculationRequest {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly inputs: Readonly<Record<string, CalculationInput | undefined>>;
}

export interface UnitConversionRecord {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly inputValue: number;
  readonly convertedValue: number;
  readonly factor: number;
  readonly offset: number;
}

export interface CalculationInputEcho {
  readonly inputId: string;
  readonly submittedValue: number | null;
  readonly submittedUnit: string | null;
  readonly normalizedValue: number | null;
  readonly normalizedUnit: string;
  readonly conversions: readonly UnitConversionRecord[];
}

export type InputValidationCode =
  | 'missing-required'
  | 'invalid-input-shape'
  | 'invalid-value'
  | 'negative-not-allowed'
  | 'out-of-range'
  | 'unexpected-input';

export interface InputValidationError {
  readonly inputId: string;
  readonly code: InputValidationCode;
  readonly message: string;
}

export type UnitErrorCode =
  | 'unit-missing'
  | 'unit-not-allowed'
  | 'conversion-unavailable'
  | 'conversion-failed';

export interface CalculationUnitError {
  readonly inputId: string;
  readonly code: UnitErrorCode;
  readonly message: string;
}

export type PopulationLimitHit =
  | {
      readonly guardId: string;
      readonly inputId: string;
      readonly operator: 'between';
      readonly actualValue: number;
      readonly minimum: number;
      readonly maximum: number;
      readonly unit: string;
      readonly message: string;
    }
  | {
      readonly guardId: string;
      readonly inputId: string;
      readonly operator: 'at-least';
      readonly actualValue: number;
      readonly value: number;
      readonly unit: string;
      readonly message: string;
    }
  | {
      readonly guardId: string;
      readonly inputId: string;
      readonly operator: 'at-most';
      readonly actualValue: number;
      readonly value: number;
      readonly unit: string;
      readonly message: string;
    };

export interface CalculationResultMetadata {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly formulaTitle: string | null;
  readonly primaryReference: FormulaReference | null;
  readonly limitations: readonly string[];
  readonly reviewStatus: FormulaReviewStatus | null;
  readonly reviewMarker: 'UNREVIEWED' | 'CLINICALLY REVIEWED' | 'UNAVAILABLE';
  readonly inputEcho: readonly CalculationInputEcho[];
  readonly deprecationNotice?: string;
}

export interface CalculationOkResult extends CalculationResultMetadata {
  readonly status: 'ok';
  readonly displayValue: number;
  readonly unroundedValue: number;
  readonly unit: string;
  readonly precision: number;
  readonly rounding: {
    readonly mode: 'half-away-from-zero';
    readonly precision: number;
    /** The tie rule has not had clinical review; see the evidence doc. */
    readonly roundingRuleReviewed: false;
  };
}

export interface CalculationInvalidInputResult extends CalculationResultMetadata {
  readonly status: 'invalid-input';
  readonly errors: readonly InputValidationError[];
}

export interface CalculationOutOfPopulationResult extends CalculationResultMetadata {
  readonly status: 'out-of-population';
  readonly limitsHit: readonly PopulationLimitHit[];
}

export interface CalculationUnitErrorResult extends CalculationResultMetadata {
  readonly status: 'unit-error';
  readonly unitErrors: readonly CalculationUnitError[];
}

export interface CalculationUnavailableResult extends CalculationResultMetadata {
  readonly status: 'unavailable';
  readonly reason: string;
}

export type CalculationResult =
  | CalculationOkResult
  | CalculationInvalidInputResult
  | CalculationOutOfPopulationResult
  | CalculationUnitErrorResult
  | CalculationUnavailableResult;
