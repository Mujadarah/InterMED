import { describe, expect, it } from 'vitest';
import * as Domain from '@intermed/domain';

export interface TestInputDefinition {
  readonly id: string;
  readonly label: string;
  readonly quantityKind: string;
  readonly canonicalUnit: string;
  readonly allowedUnits: readonly string[];
  readonly plausibleRangeByUnit: Readonly<
    Record<string, { readonly min: number; readonly max: number }>
  >;
  readonly required: boolean;
  readonly allowNegative?: boolean;
}

export interface TestUnitConversion {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly factor: number;
  readonly offset?: number;
}

export type TestPopulationGuard = {
  readonly id: string;
  readonly inputId: string;
  readonly operator: 'between';
  readonly minimum: number;
  readonly maximum: number;
  readonly unit: string;
  readonly message: string;
};

export interface TestFormulaDefinition {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly title: string;
  readonly primaryReference: {
    readonly citation: string;
    readonly urlOrDoi: string;
  };
  readonly inputs: readonly TestInputDefinition[];
  readonly unitConversions: Readonly<
    Record<string, readonly TestUnitConversion[]>
  >;
  readonly output: { readonly unit: string; readonly precision: number };
  readonly populationLimits: {
    readonly text: string;
    readonly guards: readonly TestPopulationGuard[];
  };
  readonly limitations: readonly string[];
  readonly reviewStatus:
    | 'unreviewed'
    | {
        readonly status: 'clinically-reviewed';
        readonly reviewer: string;
        readonly reviewedAt: string;
      };
  readonly deprecated?: { readonly notice: string };
  readonly compute: (
    values: Readonly<Record<string, number | undefined>>,
  ) => number;
}

export interface TestCalculationRequest {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly inputs: Readonly<
    Record<
      string,
      { readonly value: number; readonly unit: string } | undefined
    >
  >;
}

interface TestInputEcho {
  readonly inputId: string;
  readonly submittedValue: number | null;
  readonly submittedUnit: string | null;
  readonly normalizedValue: number | null;
  readonly normalizedUnit: string;
  readonly conversions: readonly {
    readonly fromUnit: string;
    readonly toUnit: string;
    readonly factor: number;
    readonly offset: number;
    readonly convertedValue: number;
  }[];
}

export interface TestCalculationResult {
  readonly status:
    'ok' | 'invalid-input' | 'out-of-population' | 'unit-error' | 'unavailable';
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly primaryReference: TestFormulaDefinition['primaryReference'] | null;
  readonly limitations: readonly string[];
  readonly reviewStatus: TestFormulaDefinition['reviewStatus'] | null;
  readonly reviewMarker: string;
  readonly inputEcho: readonly TestInputEcho[];
  readonly displayValue?: number;
  readonly unroundedValue?: number;
  readonly unit?: string;
  readonly precision?: number;
  readonly rounding?: { readonly mode: string; readonly precision: number };
  readonly errors?: readonly {
    readonly inputId: string;
    readonly code: string;
    readonly message?: string;
  }[];
  readonly unitErrors?: readonly {
    readonly inputId: string;
    readonly code: string;
  }[];
  readonly limitsHit?: readonly { readonly guardId: string }[];
  readonly deprecationNotice?: string;
}

interface TestFormulaRegistry {
  register(definition: TestFormulaDefinition): void;
  get(
    formulaId: string,
    formulaVersion: string,
  ): TestFormulaDefinition | undefined;
  listVersions(formulaId: string): readonly unknown[];
}

interface CalculatorEngineApi {
  readonly FormulaRegistry: new () => TestFormulaRegistry;
  readonly calculateFormula: (
    registry: TestFormulaRegistry,
    request: TestCalculationRequest,
  ) => TestCalculationResult;
}

const calculatorEngine = Domain as unknown as CalculatorEngineApi;

export interface FormulaContractCase {
  readonly request: TestCalculationRequest;
  readonly expectedStatus: TestCalculationResult['status'];
  readonly expectedValue?: number;
}

export interface FormulaContractCases {
  readonly positive: FormulaContractCase;
  readonly negative: FormulaContractCase & { readonly inputId: string };
  readonly nonFinite: readonly {
    readonly label: string;
    readonly request: TestCalculationRequest;
    readonly inputId: string;
  }[];
  readonly exactMinimum: FormulaContractCase;
  readonly exactMaximum: FormulaContractCase;
  readonly outOfRange: FormulaContractCase & { readonly inputId: string };
  readonly missingRequired: FormulaContractCase & { readonly inputId: string };
  readonly unitConversion: FormulaContractCase & {
    readonly inputId: string;
    readonly expectedNormalizedValue: number;
  };
  readonly invalidUnit: FormulaContractCase & { readonly inputId: string };
  readonly outOfPopulation: FormulaContractCase & { readonly guardId: string };
  readonly optionalMissing?: FormulaContractCase & { readonly inputId: string };
  readonly submittedInRangeCanonicalOut?: FormulaContractCase & {
    readonly inputId: string;
    readonly canonicalUnit: string;
  };
  readonly submittedOutOfRangeCanonicalIn?: FormulaContractCase & {
    readonly inputId: string;
  };
}

function calculateForDefinition(
  definition: TestFormulaDefinition,
  testCase: FormulaContractCase,
): TestCalculationResult {
  const registry = new calculatorEngine.FormulaRegistry();
  registry.register(definition);
  return calculatorEngine.calculateFormula(registry, testCase.request);
}

function expectProvenance(
  definition: TestFormulaDefinition,
  result: TestCalculationResult,
): void {
  expect(result.formulaId).toBe(definition.formulaId);
  expect(result.formulaVersion).toBe(definition.formulaVersion);
  expect(result.primaryReference).toEqual(definition.primaryReference);
  expect(result.limitations).toEqual(definition.limitations);
  expect(result.reviewStatus).toEqual(definition.reviewStatus);
  expect(result.reviewMarker).toBe(
    definition.reviewStatus === 'unreviewed'
      ? 'UNREVIEWED'
      : 'CLINICALLY REVIEWED',
  );
  expect(result.inputEcho).toHaveLength(definition.inputs.length);
}

function describePositiveAndBoundaries(
  definition: TestFormulaDefinition,
  cases: FormulaContractCases,
): void {
  it('computes the declared positive case with provenance', () => {
    const result = calculateForDefinition(definition, cases.positive);
    expect(result.status).toBe(cases.positive.expectedStatus);
    expectProvenance(definition, result);
    if (cases.positive.expectedValue !== undefined) {
      expect(result.status).toBe('ok');
      expect(result.displayValue).toBe(cases.positive.expectedValue);
    }
  });

  for (const testCase of [cases.exactMinimum, cases.exactMaximum]) {
    it(`accepts exact ${testCase === cases.exactMinimum ? 'minimum' : 'maximum'} range boundary`, () => {
      const result = calculateForDefinition(definition, testCase);
      expect(result.status).toBe(testCase.expectedStatus);
      expectProvenance(definition, result);
    });
  }
}

function describeInputValidation(
  definition: TestFormulaDefinition,
  cases: FormulaContractCases,
): void {
  const invalidCases = [
    { testCase: cases.negative, code: 'negative-not-allowed' },
    { testCase: cases.outOfRange, code: 'out-of-range' },
    { testCase: cases.missingRequired, code: 'missing-required' },
  ];
  for (const { testCase, code } of invalidCases) {
    it(`returns ${code} for ${testCase.inputId}`, () => {
      const result = calculateForDefinition(definition, testCase);
      expect(result.status).toBe('invalid-input');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ inputId: testCase.inputId, code }),
        ]),
      );
      if (code === 'negative-not-allowed') {
        expect(
          result.inputEcho.find((item) => item.inputId === testCase.inputId),
        ).toMatchObject({ submittedValue: -1, normalizedValue: null });
      }
      expectProvenance(definition, result);
    });
  }

  for (const testCase of cases.nonFinite) {
    it(`rejects ${testCase.label} input values`, () => {
      const result = calculateForDefinition(definition, {
        request: testCase.request,
        expectedStatus: 'invalid-input',
      });
      expect(result.status).toBe('invalid-input');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            inputId: testCase.inputId,
            code: 'invalid-value',
          }),
        ]),
      );
      expectProvenance(definition, result);
    });
  }
}

function describeUnitCases(
  definition: TestFormulaDefinition,
  cases: FormulaContractCases,
): void {
  it('records declared unit conversions in the input echo', () => {
    const result = calculateForDefinition(definition, cases.unitConversion);
    expect(result.status).toBe(cases.unitConversion.expectedStatus);
    const echo = result.inputEcho.find(
      (item) => item.inputId === cases.unitConversion.inputId,
    );
    expect(echo).toBeDefined();
    expect(echo?.normalizedValue).toBeCloseTo(
      cases.unitConversion.expectedNormalizedValue,
    );
    expect(echo?.conversions.length).toBeGreaterThan(0);
    expectProvenance(definition, result);
  });

  it('rejects undeclared units with a field-level unit error', () => {
    const result = calculateForDefinition(definition, cases.invalidUnit);
    expect(result.status).toBe('unit-error');
    expect(result.unitErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: cases.invalidUnit.inputId,
          code: 'unit-not-allowed',
        }),
      ]),
    );
    expectProvenance(definition, result);
  });
}

function describePopulationCase(
  definition: TestFormulaDefinition,
  testCase: FormulaContractCases['outOfPopulation'],
): void {
  it('reports structured population-limit hits', () => {
    const result = calculateForDefinition(definition, testCase);
    expect(result.status).toBe('out-of-population');
    expect(result.limitsHit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guardId: testCase.guardId }),
      ]),
    );
    expectProvenance(definition, result);
  });
}

function describeOptionalCase(
  definition: TestFormulaDefinition,
  testCase: NonNullable<FormulaContractCases['optionalMissing']>,
): void {
  it('accepts an omitted optional input and echoes its absence', () => {
    const result = calculateForDefinition(definition, testCase);
    expect(result.status).toBe(testCase.expectedStatus);
    expect(
      result.inputEcho.find((item) => item.inputId === testCase.inputId),
    ).toMatchObject({
      submittedValue: null,
      submittedUnit: null,
      normalizedValue: null,
      conversions: [],
    });
    expectProvenance(definition, result);
  });
}

function describeCanonicalRangeCases(
  definition: TestFormulaDefinition,
  cases: FormulaContractCases,
): void {
  const inRangeOut = cases.submittedInRangeCanonicalOut;
  if (inRangeOut) {
    it('rejects values that convert outside the canonical plausible range', () => {
      const result = calculateForDefinition(definition, inRangeOut);
      expect(result.status).toBe('invalid-input');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            inputId: inRangeOut.inputId,
            code: 'out-of-range',
          }),
        ]),
      );
      const messages = (result.errors ?? []).map((item) => item.message ?? '');
      expect(
        messages.some((message) => message.includes(inRangeOut.canonicalUnit)),
      ).toBe(true);
      expectProvenance(definition, result);
    });
  }
  const outRangeIn = cases.submittedOutOfRangeCanonicalIn;
  if (outRangeIn) {
    it('rejects out-of-range submitted values even when the canonical value is plausible', () => {
      const result = calculateForDefinition(definition, outRangeIn);
      expect(result.status).toBe('invalid-input');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            inputId: outRangeIn.inputId,
            code: 'out-of-range',
          }),
        ]),
      );
      expectProvenance(definition, result);
    });
  }
}

export function describeFormulaContract(
  definition: TestFormulaDefinition,
  cases: FormulaContractCases,
): void {
  describe(`formula contract ${definition.formulaId}@${definition.formulaVersion}`, () => {
    describePositiveAndBoundaries(definition, cases);
    describeInputValidation(definition, cases);
    describeUnitCases(definition, cases);
    describePopulationCase(definition, cases.outOfPopulation);
    describeCanonicalRangeCases(definition, cases);
    if (cases.optionalMissing) {
      describeOptionalCase(definition, cases.optionalMissing);
    }
  });
}

export function request(
  formulaId: string,
  formulaVersion: string,
  inputs: TestCalculationRequest['inputs'],
): TestCalculationRequest {
  return { formulaId, formulaVersion, inputs };
}

export function createFormulaRegistry(): TestFormulaRegistry {
  return new calculatorEngine.FormulaRegistry();
}

export function calculateWith(
  registry: TestFormulaRegistry,
  calculationRequest: TestCalculationRequest,
): TestCalculationResult {
  return calculatorEngine.calculateFormula(registry, calculationRequest);
}
