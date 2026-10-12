import { describe, expect, it } from 'vitest';
import * as Domain from '@intermed/domain';
import {
  describeFormulaContract,
  request,
  type FormulaContractCases,
  type TestCalculationResult,
  type TestFormulaDefinition,
} from './describe-formula-contract';

interface FormulaApprovalRecord {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly approvedBy: string;
  readonly approvedOn: string;
  readonly scope: string;
}

interface PendingApproval {
  readonly formulaId: string;
  readonly formulaVersion: string;
}

interface M11Api {
  readonly BMI_FORMULA?: TestFormulaDefinition;
  readonly MOSTELLER_BSA_FORMULA?: TestFormulaDefinition;
  readonly FORMULA_APPROVALS?: readonly FormulaApprovalRecord[];
  readonly pendingApprovals?: (registry: object) => readonly PendingApproval[];
}

const m11 = Domain as unknown as M11Api;
const bmiFormula = m11.BMI_FORMULA;
const bsaFormula = m11.MOSTELLER_BSA_FORMULA;

type SubmittedInput = { readonly value: number; readonly unit: string };
type SubmittedInputs = Readonly<Record<string, SubmittedInput | undefined>>;

function calculate(
  definition: TestFormulaDefinition,
  inputs: SubmittedInputs,
): TestCalculationResult {
  const registry = new Domain.FormulaRegistry();
  registry.register(definition);
  return Domain.calculateFormula(
    registry,
    request(definition.formulaId, definition.formulaVersion, inputs),
  );
}

function calculateOk(
  definition: TestFormulaDefinition,
  inputs: SubmittedInputs,
): TestCalculationResult {
  const result = calculate(definition, inputs);
  expect(result.status).toBe('ok');
  return result;
}

function baseInputs(age = 30): Record<string, SubmittedInput> {
  return {
    weight: { value: 70, unit: 'kg' },
    height: { value: 175, unit: 'cm' },
    age: { value: age, unit: 'years' },
  };
}

function formulaContractCases(
  definition: TestFormulaDefinition,
  expectedDisplayValue: number,
): FormulaContractCases {
  const base = baseInputs();
  return {
    positive: {
      request: request(definition.formulaId, definition.formulaVersion, base),
      expectedStatus: 'ok',
      expectedValue: expectedDisplayValue,
    },
    negative: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        weight: { value: -1, unit: 'kg' },
      }),
      expectedStatus: 'invalid-input',
      inputId: 'weight',
    },
    nonFinite: [
      {
        label: 'NaN',
        request: request(definition.formulaId, definition.formulaVersion, {
          ...base,
          weight: { value: Number.NaN, unit: 'kg' },
        }),
        inputId: 'weight',
      },
      {
        label: 'positive infinity',
        request: request(definition.formulaId, definition.formulaVersion, {
          ...base,
          weight: { value: Number.POSITIVE_INFINITY, unit: 'kg' },
        }),
        inputId: 'weight',
      },
      {
        label: 'negative infinity',
        request: request(definition.formulaId, definition.formulaVersion, {
          ...base,
          weight: { value: Number.NEGATIVE_INFINITY, unit: 'kg' },
        }),
        inputId: 'weight',
      },
    ],
    exactMinimum: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        weight: { value: 1, unit: 'kg' },
      }),
      expectedStatus: 'ok',
    },
    exactMaximum: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        weight: { value: 500, unit: 'kg' },
      }),
      expectedStatus: 'ok',
    },
    outOfRange: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        weight: { value: 500.0001, unit: 'kg' },
      }),
      expectedStatus: 'invalid-input',
      inputId: 'weight',
    },
    missingRequired: {
      request: request(definition.formulaId, definition.formulaVersion, {
        weight: base.weight,
        age: base.age,
      }),
      expectedStatus: 'invalid-input',
      inputId: 'height',
    },
    unitConversion: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        weight: { value: 70 / 0.45359237, unit: 'lb' },
      }),
      expectedStatus: 'ok',
      inputId: 'weight',
      expectedNormalizedValue: 70,
    },
    invalidUnit: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        weight: { value: 70, unit: 'stone' },
      }),
      expectedStatus: 'unit-error',
      inputId: 'weight',
    },
    outOfPopulation: {
      request: request(definition.formulaId, definition.formulaVersion, {
        ...base,
        age: { value: 17.999, unit: 'years' },
      }),
      expectedStatus: 'out-of-population',
      guardId: 'adult-age',
    },
  };
}

describe('Milestone 11 BMI and BSA candidates', () => {
  it('exports the pinned, explicitly unreviewed formula versions', () => {
    expect(bmiFormula).toBeDefined();
    expect(bsaFormula).toBeDefined();
    if (!bmiFormula || !bsaFormula) return;

    expect(bmiFormula).toMatchObject({
      formulaId: 'bmi',
      formulaVersion: '1.0.0',
      reviewStatus: 'unreviewed',
      output: {
        unit: 'kg/m²',
        rounding: { mode: 'half-away-from-zero', precision: 1 },
      },
    });
    expect(bsaFormula).toMatchObject({
      formulaId: 'bsa-mosteller',
      formulaVersion: '1.0.0',
      reviewStatus: 'unreviewed',
      output: {
        unit: 'm²',
        rounding: { mode: 'half-away-from-zero', precision: 2 },
      },
    });
  });

  it('exports an immutable empty approval register and pendingApprovals', () => {
    expect(m11.FORMULA_APPROVALS).toEqual([]);
    expect(Object.isFrozen(m11.FORMULA_APPROVALS)).toBe(true);
    expect(m11.pendingApprovals).toBeTypeOf('function');
  });

  if (bmiFormula && bsaFormula) {
    it('keeps both exact formula versions in the pending-approval list', () => {
      if (!m11.pendingApprovals) {
        throw new Error('pendingApprovals export is missing.');
      }
      const registry = new Domain.FormulaRegistry();
      registry.register(bmiFormula);
      registry.register(bsaFormula);

      expect(m11.pendingApprovals(registry)).toEqual([
        { formulaId: 'bmi', formulaVersion: '1.0.0' },
        { formulaId: 'bsa-mosteller', formulaVersion: '1.0.0' },
      ]);
    });

    it('documents the unreviewed engineering ranges and formula limitations', () => {
      const bmiLimitations = bmiFormula.limitations.join(' ').toLowerCase();
      const bsaLimitations = bsaFormula.limitations.join(' ').toLowerCase();
      expect(bmiLimitations).toContain(
        'engineering plausibility limits, pending owner review',
      );
      expect(bsaLimitations).toContain(
        'engineering plausibility limits, pending owner review',
      );
      expect(bmiLimitations).toContain('muscle mass');
      expect(bmiLimitations).toContain('pregnancy');
      expect(bmiLimitations).toContain('amputation');
      expect(bmiLimitations).toContain('edema');
      expect(bmiLimitations).toContain('not a diagnosis');
      expect(bsaLimitations).toContain('estimate');
      expect(bsaLimitations).toContain('no dosing advice');
      expect(bsaLimitations).toContain('du bois');
      expect(bsaLimitations).toContain('source populations');
      expect(bmiFormula.inputs.map((input) => input.id)).toEqual([
        'weight',
        'height',
        'age',
      ]);
      expect(bsaFormula.inputs.map((input) => input.id)).toEqual([
        'weight',
        'height',
        'age',
      ]);
    });

    it('keeps a version-pinned BMI golden with unrounded and display values', () => {
      const result = calculateOk(bmiFormula, {
        weight: { value: 70, unit: 'kg' },
        height: { value: 175, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result).toMatchObject({
        formulaId: 'bmi',
        formulaVersion: '1.0.0',
        unroundedValue: 22.857142857142858,
        displayValue: 22.9,
        reviewStatus: 'unreviewed',
        rounding: { mode: 'half-away-from-zero', precision: 1 },
      });
    });

    it('keeps a second BMI golden at the 25 cutoff', () => {
      const result = calculateOk(bmiFormula, {
        weight: { value: 100, unit: 'kg' },
        height: { value: 200, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result).toMatchObject({
        formulaId: 'bmi',
        formulaVersion: '1.0.0',
        unroundedValue: 25,
        displayValue: 25,
        classification: { code: 'pre-obese' },
      });
    });

    it('keeps a third BMI golden at the 18.5 cutoff', () => {
      const result = calculateOk(bmiFormula, {
        weight: { value: 56.65625, unit: 'kg' },
        height: { value: 175, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result).toMatchObject({
        formulaId: 'bmi',
        formulaVersion: '1.0.0',
        unroundedValue: 18.5,
        displayValue: 18.5,
        classification: { code: 'normal' },
      });
    });

    it('keeps a version-pinned Mosteller BSA golden with full precision', () => {
      const result = calculateOk(bsaFormula, {
        weight: { value: 70, unit: 'kg' },
        height: { value: 175, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result).toMatchObject({
        formulaId: 'bsa-mosteller',
        formulaVersion: '1.0.0',
        unroundedValue: 1.8446619684315546,
        displayValue: 1.84,
        reviewStatus: 'unreviewed',
        rounding: { mode: 'half-away-from-zero', precision: 2 },
      });
      expect(result.classification).toBeUndefined();
    });

    it('keeps a second Mosteller BSA golden at exactly two square metres', () => {
      const result = calculateOk(bsaFormula, {
        weight: { value: 80, unit: 'kg' },
        height: { value: 180, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result).toMatchObject({
        formulaId: 'bsa-mosteller',
        formulaVersion: '1.0.0',
        unroundedValue: 2,
        displayValue: 2,
      });
      expect(result.classification).toBeUndefined();
    });

    it('keeps a third Mosteller BSA golden for 160 centimetres and 50 kilograms', () => {
      const result = calculateOk(bsaFormula, {
        weight: { value: 50, unit: 'kg' },
        height: { value: 160, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result).toMatchObject({
        formulaId: 'bsa-mosteller',
        formulaVersion: '1.0.0',
        unroundedValue: 1.4907119849998598,
        displayValue: 1.49,
      });
    });

    for (const formula of [bmiFormula, bsaFormula]) {
      const expectedUnrounded =
        formula.formulaId === 'bmi' ? 22.857142857142858 : 1.8446619684315546;
      const expectedDisplay = formula.formulaId === 'bmi' ? 22.9 : 1.84;
      const formulaLabel = formula.formulaId === 'bmi' ? 'BMI' : 'BSA';

      for (const weight of [
        { value: 70, unit: 'kg' },
        { value: 70 / 0.45359237, unit: 'lb' },
      ]) {
        for (const height of [
          { value: 175, unit: 'cm' },
          { value: 1.75, unit: 'm' },
          { value: 175 / 2.54, unit: 'in' },
        ]) {
          it(`calculates ${formulaLabel} for ${weight.unit} and ${height.unit}`, () => {
            const result = calculateOk(formula, {
              weight,
              height,
              age: { value: 30, unit: 'years' },
            });

            expect(result.unroundedValue).toBeCloseTo(expectedUnrounded, 12);
            expect(result.displayValue).toBe(expectedDisplay);
            expect(result.formulaVersion).toBe('1.0.0');
          });
        }
      }
    }

    it('classifies exact BMI cutoffs from the unrounded value', () => {
      const exactCases = [
        { value: 18.5, code: 'normal' },
        { value: 25, code: 'pre-obese' },
        { value: 30, code: 'obese-class-i' },
        { value: 35, code: 'obese-class-ii' },
        { value: 40, code: 'obese-class-iii' },
      ];

      for (const testCase of exactCases) {
        const result = calculateOk(bmiFormula, {
          weight: { value: testCase.value * 4, unit: 'kg' },
          height: { value: 200, unit: 'cm' },
          age: { value: 30, unit: 'years' },
        });

        expect(result.unroundedValue).toBe(testCase.value);
        expect(result.classification?.code).toBe(testCase.code);
      }
    });

    it('classifies just below each BMI cutoff using the unrounded value', () => {
      const belowCases = [
        { value: 18.4999999, code: 'underweight', displayValue: 18.5 },
        { value: 24.9999999, code: 'normal', displayValue: 25 },
        { value: 29.9999999, code: 'pre-obese', displayValue: 30 },
        { value: 34.9999999, code: 'obese-class-i', displayValue: 35 },
        { value: 39.9999999, code: 'obese-class-ii', displayValue: 40 },
      ];

      for (const testCase of belowCases) {
        const result = calculateOk(bmiFormula, {
          weight: { value: testCase.value * 4, unit: 'kg' },
          height: { value: 200, unit: 'cm' },
          age: { value: 30, unit: 'years' },
        });

        expect(result.unroundedValue).toBe(testCase.value);
        expect(result.displayValue).toBe(testCase.displayValue);
        expect(result.classification?.code).toBe(testCase.code);
      }
    });

    it('does not classify a rounded BMI display of 25 as pre-obese below 25', () => {
      const result = calculateOk(bmiFormula, {
        weight: { value: 24.96 * 4, unit: 'kg' },
        height: { value: 200, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result.unroundedValue).toBe(24.96);
      expect(result.displayValue).toBe(25);
      expect(result.classification?.code).toBe('normal');
    });

    it('accepts age 18 and 130, while age 17.999 is outside the adult population', () => {
      for (const age of [18, 130]) {
        expect(calculate(bmiFormula, { ...baseInputs(age) }).status).toBe('ok');
        expect(calculate(bsaFormula, { ...baseInputs(age) }).status).toBe('ok');
      }
      for (const formula of [bmiFormula, bsaFormula]) {
        const result = calculate(formula, {
          ...baseInputs(17.999),
        });
        expect(result.status).toBe('out-of-population');
        expect(result.limitsHit).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ guardId: 'adult-age' }),
          ]),
        );
      }
    });

    it('accepts the declared weight and height plausibility endpoints', () => {
      for (const formula of [bmiFormula, bsaFormula]) {
        for (const weight of [1, 500]) {
          expect(
            calculate(formula, {
              ...baseInputs(),
              weight: { value: weight, unit: 'kg' },
            }).status,
          ).toBe('ok');
        }
        for (const height of [50, 272]) {
          expect(
            calculate(formula, {
              ...baseInputs(),
              height: { value: height, unit: 'cm' },
            }).status,
          ).toBe('ok');
        }
      }
    });

    it('rejects values outside the weight, height, and age plausibility endpoints', () => {
      const outsideCases = [
        { inputId: 'weight', value: 0.999, unit: 'kg' },
        { inputId: 'weight', value: 500.0001, unit: 'kg' },
        { inputId: 'height', value: 49.999, unit: 'cm' },
        { inputId: 'height', value: 272.0001, unit: 'cm' },
        { inputId: 'age', value: 130.0001, unit: 'years' },
      ];

      for (const formula of [bmiFormula, bsaFormula]) {
        for (const testCase of outsideCases) {
          const result = calculate(formula, {
            ...baseInputs(),
            [testCase.inputId]: {
              value: testCase.value,
              unit: testCase.unit,
            },
          });
          expect(result.status).toBe('invalid-input');
          expect(result.errors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                inputId: testCase.inputId,
                code: 'out-of-range',
              }),
            ]),
          );
        }
      }
    });

    it('rejects missing, zero, and negative anthropometric inputs', () => {
      for (const formula of [bmiFormula, bsaFormula]) {
        const missing = calculate(formula, {});
        expect(missing.status).toBe('invalid-input');
        expect(missing.errors).toHaveLength(3);

        for (const inputId of ['weight', 'height']) {
          const zero = calculate(formula, {
            ...baseInputs(),
            [inputId]: {
              value: 0,
              unit: inputId === 'weight' ? 'kg' : 'cm',
            },
          });
          expect(zero.status).toBe('invalid-input');
          expect(zero.errors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ inputId, code: 'out-of-range' }),
            ]),
          );

          const negative = calculate(formula, {
            ...baseInputs(),
            [inputId]: {
              value: -1,
              unit: inputId === 'weight' ? 'kg' : 'cm',
            },
          });
          expect(negative.status).toBe('invalid-input');
          expect(negative.errors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                inputId,
                code: 'negative-not-allowed',
              }),
            ]),
          );
        }
      }
    });

    it('rejects NaN and positive or negative infinity for each input', () => {
      const nonFiniteValues = [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ];
      for (const formula of [bmiFormula, bsaFormula]) {
        for (const inputId of ['weight', 'height', 'age']) {
          for (const value of nonFiniteValues) {
            const result = calculate(formula, {
              ...baseInputs(),
              [inputId]: {
                value,
                unit:
                  inputId === 'weight'
                    ? 'kg'
                    : inputId === 'height'
                      ? 'cm'
                      : 'years',
              },
            });
            expect(result.status).toBe('invalid-input');
            expect(result.errors).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ inputId, code: 'invalid-value' }),
              ]),
            );
          }
        }
      }
    });

    it('rejects unsupported weight, height, and age units', () => {
      const wrongUnits = [
        { inputId: 'weight', value: 70, unit: 'stone' },
        { inputId: 'height', value: 175, unit: 'ft' },
        { inputId: 'age', value: 30, unit: 'months' },
      ];
      for (const formula of [bmiFormula, bsaFormula]) {
        for (const testCase of wrongUnits) {
          const result = calculate(formula, {
            ...baseInputs(),
            [testCase.inputId]: {
              value: testCase.value,
              unit: testCase.unit,
            },
          });
          expect(result.status).toBe('unit-error');
          expect(result.unitErrors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                inputId: testCase.inputId,
                code: 'unit-not-allowed',
              }),
            ]),
          );
        }
      }
    });

    it('normalizes pound and inch values to kilograms and centimetres', () => {
      for (const formula of [bmiFormula, bsaFormula]) {
        const result = calculateOk(formula, {
          weight: { value: 70 / 0.45359237, unit: 'lb' },
          height: { value: 175 / 2.54, unit: 'in' },
          age: { value: 30, unit: 'years' },
        });
        const weightEcho = result.inputEcho.find(
          (item) => item.inputId === 'weight',
        );
        const heightEcho = result.inputEcho.find(
          (item) => item.inputId === 'height',
        );
        expect(weightEcho?.normalizedValue).toBeCloseTo(70, 12);
        expect(heightEcho?.normalizedValue).toBeCloseTo(
          formula.formulaId === 'bmi' ? 1.75 : 175,
          12,
        );
        expect(weightEcho?.conversions[0]).toMatchObject({
          fromUnit: 'lb',
          toUnit: 'kg',
          factor: 0.45359237,
        });
        expect(heightEcho?.conversions[0]).toMatchObject({
          fromUnit: 'in',
          toUnit: formula.formulaId === 'bmi' ? 'm' : 'cm',
        });
      }
    });

    it('keeps pound and inch conversion pairs round-trip consistent', () => {
      const conversions = Domain.STANDARD_UNIT_CONVERSIONS as Readonly<
        Record<
          string,
          readonly {
            readonly fromUnit: string;
            readonly toUnit: string;
            readonly factor: number;
          }[]
        >
      >;
      const factor = (
        quantity: string,
        fromUnit: string,
        toUnit: string,
      ): number => {
        const rule = conversions[quantity]?.find(
          (candidate) =>
            candidate.fromUnit === fromUnit && candidate.toUnit === toUnit,
        );
        if (!rule) throw new Error(`Missing ${fromUnit} to ${toUnit} rule.`);
        return rule.factor;
      };

      expect(
        70 * factor('mass', 'kg', 'lb') * factor('mass', 'lb', 'kg'),
      ).toBeCloseTo(70, 12);
      expect(
        175 * factor('length', 'cm', 'in') * factor('length', 'in', 'cm'),
      ).toBeCloseTo(175, 12);
    });
  }
});

if (bmiFormula) {
  describeFormulaContract(bmiFormula, formulaContractCases(bmiFormula, 22.9));
}
if (bsaFormula) {
  describeFormulaContract(bsaFormula, formulaContractCases(bsaFormula, 1.84));
}
