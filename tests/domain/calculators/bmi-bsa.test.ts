import { describe, expect, it } from 'vitest';
import * as Domain from '@intermed/domain';
import {
  describeFormulaContract,
  request,
  type FormulaContractCases,
  type TestFormulaComponent,
  type TestFormulaComponentVersions,
  type TestCalculationResult,
  type TestFormulaDefinition,
} from './describe-formula-contract';

interface FormulaApprovalRecord {
  readonly formulaId: string;
  readonly component: TestFormulaComponent;
  readonly componentVersion: string;
  readonly approvedBy: string;
  readonly approvedOn: string;
  readonly scope: string;
}

interface PendingApproval {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly component: TestFormulaComponent;
  readonly componentVersion: string;
}

interface M11Api {
  readonly BMI_FORMULA?: TestFormulaDefinition;
  readonly MOSTELLER_BSA_FORMULA?: TestFormulaDefinition;
  readonly FORMULA_APPROVALS?: readonly FormulaApprovalRecord[];
  readonly getFormulaVersionId?: (
    componentVersions: TestFormulaComponentVersions,
  ) => string;
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
  confirmedChecks?: readonly string[],
): TestCalculationResult {
  const registry = new Domain.FormulaRegistry();
  registry.register(definition);
  return Domain.calculateFormula(
    registry,
    request(
      definition.formulaId,
      definition.formulaVersion,
      inputs,
      confirmedChecks,
    ),
  );
}

function calculateOk(
  definition: TestFormulaDefinition,
  inputs: SubmittedInputs,
  confirmedChecks?: readonly string[],
): TestCalculationResult {
  const result = calculate(definition, inputs, confirmedChecks);
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

function expectedPendingComponents(
  definition: TestFormulaDefinition,
): PendingApproval[] {
  return Object.entries(definition.componentVersions)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([component, componentVersion]) => ({
      formulaId: definition.formulaId,
      formulaVersion: definition.formulaVersion,
      component: component as TestFormulaComponent,
      componentVersion,
    }));
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
      request: request(
        definition.formulaId,
        definition.formulaVersion,
        {
          ...base,
          weight: { value: 1, unit: 'kg' },
        },
        (definition.softChecks ?? []).map((check) => check.id),
      ),
      expectedStatus: 'ok',
    },
    exactMaximum: {
      request: request(
        definition.formulaId,
        definition.formulaVersion,
        {
          ...base,
          weight: { value: 500, unit: 'kg' },
        },
        (definition.softChecks ?? []).map((check) => check.id),
      ),
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
  };
}

describe('Milestone 11 BMI and BSA candidates', () => {
  it('exports the pinned, explicitly unreviewed formula versions', () => {
    expect(bmiFormula).toBeDefined();
    expect(bsaFormula).toBeDefined();
    if (!bmiFormula || !bsaFormula) return;

    expect(bmiFormula).toMatchObject({
      formulaId: 'bmi',
      componentVersions: {
        formula: '1.0.0',
        population: '2.0.0',
        classification: '2.0.0',
        presentation: '2.0.0',
        confirmation: '1.0.0',
      },
      reviewStatus: 'unreviewed',
      output: {
        unit: 'kg/m²',
        rounding: { mode: 'half-up-decimal', precision: 1 },
      },
    });
    expect(bsaFormula).toMatchObject({
      formulaId: 'bsa-mosteller',
      componentVersions: {
        formula: '1.0.0',
        population: '2.0.0',
        presentation: '2.0.0',
        confirmation: '1.0.0',
      },
      reviewStatus: 'unreviewed',
      output: {
        unit: 'm²',
        rounding: { mode: 'half-up-decimal', precision: 2 },
      },
    });
  });

  it('exports deeply frozen definitions so a pinned version cannot be mutated before registration', () => {
    for (const formula of [bmiFormula, bsaFormula]) {
      expect(formula).toBeDefined();
      if (!formula) return;
      expect(Object.isFrozen(formula)).toBe(true);
      expect(Object.isFrozen(formula.primaryReference)).toBe(true);
      expect(Object.isFrozen(formula.inputs)).toBe(true);
      for (const input of formula.inputs) {
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.allowedUnits)).toBe(true);
      }
      expect(Object.isFrozen(formula.output)).toBe(true);
      expect(Object.isFrozen(formula.output.rounding)).toBe(true);
      expect(Object.isFrozen(formula.limitations)).toBe(true);
      expect(Object.isFrozen(formula.populationLimits)).toBe(true);
      expect(() => {
        (formula.limitations as string[]).push('tampered');
      }).toThrow(TypeError);
    }
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
        ...expectedPendingComponents(bmiFormula),
        ...expectedPendingComponents(bsaFormula),
      ]);
    });

    it('documents the unreviewed engineering ranges and formula limitations', () => {
      const bmiLimitations = bmiFormula.limitations.join(' ').toLowerCase();
      const bsaLimitations = bsaFormula.limitations.join(' ').toLowerCase();
      const bmiCitation = bmiFormula.primaryReference.citation.toLowerCase();
      expect(bmiLimitations).toContain(
        'technical bounds, not clinically validated plausibility thresholds',
      );
      expect(bmiLimitations).toContain(
        'who technical report series 894 (2000)',
      );
      expect(bmiLimitations).toContain(
        'who international adult classification',
      );
      expect(bmiLimitations).toContain('adults only');
      expect(bmiLimitations).toContain(
        'cardiometabolic risk may occur at lower bmi values in certain populations',
      );
      expect(bmiLimitations).toContain('population-specific assessment');
      expect(bmiLimitations).toContain(
        'may be added separately in a future version',
      );
      expect(bmiLimitations).toContain('adolescents up to 19 years');
      expect(bmiLimitations).toContain(
        'does not implement pediatric bmi classification',
      );
      expect(bmiCitation).toContain('quetelet a (1835)');
      expect(bsaLimitations).toContain(
        'technical bounds, not clinically validated plausibility thresholds',
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
      expect(bsaLimitations).toContain("outside this release's adult scope");
      expect(bsaLimitations).toContain(
        'displayed rounded value is not to be used as an implicit input for medication-dose calculations',
      );
      expect(bsaLimitations).toContain('proposed, pending owner sign-off');
      expect(bmiLimitations).toContain('proposed, pending owner sign-off');
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
        formulaVersion: bmiFormula.formulaVersion,
        unroundedValue: 22.857142857142858,
        displayValue: 22.9,
        reviewStatus: 'unreviewed',
        rounding: { mode: 'half-up-decimal', precision: 1 },
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
        formulaVersion: bmiFormula.formulaVersion,
        unroundedValue: 25,
        displayValue: 25,
        classification: { code: 'who-international-adult-pre-obese' },
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
        formulaVersion: bmiFormula.formulaVersion,
        unroundedValue: 18.5,
        displayValue: 18.5,
        classification: { code: 'who-international-adult-normal' },
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
        formulaVersion: bsaFormula.formulaVersion,
        unroundedValue: 1.8446619684315546,
        displayValue: 1.84,
        reviewStatus: 'unreviewed',
        rounding: { mode: 'half-up-decimal', precision: 2 },
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
        formulaVersion: bsaFormula.formulaVersion,
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
        formulaVersion: bsaFormula.formulaVersion,
        unroundedValue: 1.4907119849998598,
        displayValue: 1.49,
      });
    });

    it('uses decimal half-up presentation for the BMI 22.85 vector', () => {
      const result = calculateOk(bmiFormula, {
        weight: { value: 91.4, unit: 'kg' },
        height: { value: 200, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      });

      expect(result.unroundedValue).toBe(22.85);
      expect(result.displayValue).toBe(22.9);
      expect(result.rounding).toEqual({
        mode: 'half-up-decimal',
        precision: 1,
      });
      expect(result.classificationNote).toBeUndefined();
    });

    it('uses decimal half-up presentation for the BSA 1.005, 2.675 and 0.125 vectors', () => {
      const vectors = [
        {
          weight: 20.2005,
          height: 180,
          expected: 1.005,
          display: 1.01,
          confirmedChecks: ['weight-unusual', 'implied-bmi-outside-range'],
        },
        {
          weight: 143.1125,
          height: 180,
          expected: 2.675,
          display: 2.68,
          confirmedChecks: [],
        },
        {
          weight: 1.125,
          height: 50,
          expected: 0.125,
          display: 0.13,
          confirmedChecks: [
            'weight-unusual',
            'height-unusual',
            'implied-bmi-outside-range',
          ],
        },
      ] as const;

      for (const vector of vectors) {
        const result = calculateOk(
          bsaFormula,
          {
            weight: { value: vector.weight, unit: 'kg' },
            height: { value: vector.height, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          vector.confirmedChecks,
        );

        expect(result.unroundedValue).toBeCloseTo(vector.expected, 12);
        expect(result.displayValue).toBe(vector.display);
        expect(result.confirmedChecks?.map((check) => check.id)).toEqual(
          vector.confirmedChecks,
        );
        expect(result.rounding).toEqual({
          mode: 'half-up-decimal',
          precision: 2,
        });
      }
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
            expect(result.formulaVersion).toBe(formula.formulaVersion);
          });
        }
      }
    }

    it('classifies exact BMI cutoffs from the unrounded value', () => {
      const exactCases = [
        { value: 18.5, code: 'who-international-adult-normal' },
        { value: 25, code: 'who-international-adult-pre-obese' },
        { value: 30, code: 'who-international-adult-obese-class-i' },
        { value: 35, code: 'who-international-adult-obese-class-ii' },
        { value: 40, code: 'who-international-adult-obese-class-iii' },
      ];

      for (const testCase of exactCases) {
        const result = calculateOk(bmiFormula, {
          weight: { value: testCase.value * 4, unit: 'kg' },
          height: { value: 200, unit: 'cm' },
          age: { value: 30, unit: 'years' },
        });

        expect(result.unroundedValue).toBe(testCase.value);
        expect(result.classification?.code).toBe(testCase.code);
        expect(result.displayValue).toBe(testCase.value);
        expect(result.classificationNote).toBeUndefined();
        expect(result.classification?.label).toContain(
          'WHO international adult classification',
        );
        expect(result.classification?.label).toContain(
          'WHO Technical Report Series 894 (2000)',
        );
      }
    });

    it('classifies just below each BMI cutoff using the unrounded value', () => {
      const belowCases = [
        {
          value: 18.4999999,
          code: 'who-international-adult-underweight',
          displayValue: 18.5,
        },
        {
          value: 24.9999999,
          code: 'who-international-adult-normal',
          displayValue: 25,
        },
        {
          value: 29.9999999,
          code: 'who-international-adult-pre-obese',
          displayValue: 30,
        },
        {
          value: 34.9999999,
          code: 'who-international-adult-obese-class-i',
          displayValue: 35,
        },
        {
          value: 39.9999999,
          code: 'who-international-adult-obese-class-ii',
          displayValue: 40,
        },
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
        expect(result.classificationNote).toContain(String(testCase.value));
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
      expect(result.classification?.code).toBe(
        'who-international-adult-normal',
      );
      expect(result.classificationNote).toContain(
        'WHO international adult classification',
      );
      expect(result.classificationNote).toContain('24.96');
    });

    it('accepts the adult technical age bounds and rejects ages below 18', () => {
      for (const formula of [bmiFormula, bsaFormula]) {
        const confirmations = (formula.softChecks ?? []).map(
          (check) => check.id,
        );
        for (const age of [18, 130]) {
          expect(
            calculate(formula, { ...baseInputs(age) }, confirmations).status,
          ).toBe('ok');
        }
      }
      for (const formula of [bmiFormula, bsaFormula]) {
        const result = calculate(formula, {
          ...baseInputs(17.999),
        });
        expect(result.status).toBe('invalid-input');
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ inputId: 'age', code: 'out-of-range' }),
          ]),
        );
      }
    });

    it('requires explicit confirmation for proposed unusual input and BMI ranges', () => {
      const vectors = [
        {
          label: 'weight below 30 kg',
          inputs: {
            weight: { value: 29.99, unit: 'kg' },
            height: { value: 130, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          checkIds: ['weight-unusual'],
        },
        {
          label: 'weight above 250 kg',
          inputs: {
            weight: { value: 250.01, unit: 'kg' },
            height: { value: 200, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          checkIds: ['weight-unusual'],
        },
        {
          label: 'height below 130 cm',
          inputs: {
            weight: { value: 70, unit: 'kg' },
            height: { value: 129.99, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          checkIds: ['height-unusual'],
        },
        {
          label: 'height above 220 cm',
          inputs: {
            weight: { value: 70, unit: 'kg' },
            height: { value: 220.01, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          checkIds: ['height-unusual'],
        },
        {
          label: 'age above 110 years',
          inputs: {
            ...baseInputs(111),
          },
          checkIds: ['age-over-110'],
        },
        {
          label: 'implied BMI below 12',
          inputs: {
            weight: { value: 47.96, unit: 'kg' },
            height: { value: 200, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          checkIds: ['implied-bmi-outside-range'],
        },
        {
          label: 'implied BMI above 70',
          inputs: {
            weight: { value: 280.04, unit: 'kg' },
            height: { value: 200, unit: 'cm' },
            age: { value: 30, unit: 'years' },
          },
          checkIds: ['weight-unusual', 'implied-bmi-outside-range'],
        },
      ] as const;

      for (const formula of [bmiFormula, bsaFormula]) {
        for (const vector of vectors) {
          const result = calculate(formula, vector.inputs);
          expect(result.status, `${formula.formulaId}: ${vector.label}`).toBe(
            'confirmation-required',
          );
          expect(result.checks?.map((check) => check.id)).toEqual(
            vector.checkIds,
          );
          expect(
            result.checks?.every((check) => check.message.length > 0),
          ).toBe(true);
          expect(result).not.toHaveProperty('unroundedValue');
          expect(result).not.toHaveProperty('displayValue');
        }
      }
    });

    it('treats proposed soft-check endpoints as inclusive', () => {
      const endpointVectors = [
        { weight: 30, height: 130, age: 30, checkIds: [] },
        { weight: 250, height: 200, age: 30, checkIds: [] },
        { weight: 70, height: 130, age: 30, checkIds: [] },
        { weight: 70, height: 220, age: 30, checkIds: [] },
        { weight: 70, height: 175, age: 110, checkIds: [] },
        { weight: 48, height: 200, age: 30, checkIds: [] },
        {
          weight: 280,
          height: 200,
          age: 30,
          checkIds: ['weight-unusual'],
        },
      ] as const;

      for (const formula of [bmiFormula, bsaFormula]) {
        for (const vector of endpointVectors) {
          const inputs = {
            weight: { value: vector.weight, unit: 'kg' },
            height: { value: vector.height, unit: 'cm' },
            age: { value: vector.age, unit: 'years' },
          };
          const result = calculate(formula, inputs, vector.checkIds);
          expect(
            result.status,
            `${formula.formulaId} ${vector.weight}/${vector.height}/${vector.age}: ${JSON.stringify(result)}`,
          ).toBe('ok');
          expect(result.confirmedChecks?.map((check) => check.id)).toEqual(
            vector.checkIds,
          );
          if (vector.weight === 280) {
            expect(
              result.confirmedChecks?.map((check) => check.id),
            ).not.toContain('implied-bmi-outside-range');
          }
        }
      }
    });

    it('returns values only after every triggered check is confirmed', () => {
      const inputs = {
        weight: { value: 20, unit: 'kg' },
        height: { value: 175, unit: 'cm' },
        age: { value: 30, unit: 'years' },
      };
      for (const formula of [bmiFormula, bsaFormula]) {
        const required = calculate(formula, inputs);
        expect(required.status).toBe('confirmation-required');
        expect(required.checks?.map((check) => check.id)).toEqual([
          'weight-unusual',
          'implied-bmi-outside-range',
        ]);

        const partial = calculate(formula, inputs, ['weight-unusual']);
        expect(partial.status).toBe('confirmation-required');
        expect(partial.checks?.map((check) => check.id)).toEqual([
          'weight-unusual',
          'implied-bmi-outside-range',
        ]);
        expect(partial).not.toHaveProperty('unroundedValue');

        const confirmed = calculateOk(formula, inputs, [
          'weight-unusual',
          'implied-bmi-outside-range',
        ]);
        expect(confirmed.confirmedChecks?.map((check) => check.id)).toEqual([
          'weight-unusual',
          'implied-bmi-outside-range',
        ]);
      }
    });

    it('accepts the declared weight and height plausibility endpoints', () => {
      const boundaryInputs = [
        { weight: { value: 1, unit: 'kg' } },
        { weight: { value: 500, unit: 'kg' } },
        { weight: { value: 2.2046226218487757, unit: 'lb' } },
        {
          weight: { value: 500 * 2.2046226218487757, unit: 'lb' },
        },
        { height: { value: 50, unit: 'cm' } },
        { height: { value: 272, unit: 'cm' } },
        { height: { value: 0.5, unit: 'm' } },
        { height: { value: 2.72, unit: 'm' } },
        { height: { value: 50 / 2.54, unit: 'in' } },
        { height: { value: 272 / 2.54, unit: 'in' } },
      ] as const;

      for (const formula of [bmiFormula, bsaFormula]) {
        const confirmations = (formula.softChecks ?? []).map(
          (check) => check.id,
        );
        for (const boundary of boundaryInputs) {
          expect(
            calculate(formula, { ...baseInputs(), ...boundary }, confirmations)
              .status,
          ).toBe('ok');
        }
      }
    });

    it('rejects values outside the weight, height, and age plausibility endpoints', () => {
      const outsideCases = [
        { inputId: 'weight', value: 0.999, unit: 'kg' },
        { inputId: 'weight', value: 500.0001, unit: 'kg' },
        { inputId: 'weight', value: 2.2045, unit: 'lb' },
        {
          inputId: 'weight',
          value: 500 * 2.2046226218487757 + 0.0001,
          unit: 'lb',
        },
        { inputId: 'height', value: 49.999, unit: 'cm' },
        { inputId: 'height', value: 272.0001, unit: 'cm' },
        { inputId: 'height', value: 0.4999, unit: 'm' },
        { inputId: 'height', value: 2.7201, unit: 'm' },
        { inputId: 'height', value: 50 / 2.54 - 0.0001, unit: 'in' },
        { inputId: 'height', value: 272 / 2.54 + 0.0001, unit: 'in' },
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
