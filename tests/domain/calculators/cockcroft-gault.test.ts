import { describe, expect, it } from 'vitest';
import * as Domain from '@intermed/domain';
import {
  describeFormulaContract,
  request,
  type FormulaContractCases,
  type TestCalculationResult,
  type TestFormulaComponent,
  type TestFormulaDefinition,
} from './describe-formula-contract';

interface PendingApproval {
  readonly formulaId: string;
  readonly formulaVersion: string;
  readonly component: TestFormulaComponent;
  readonly componentVersion: string;
}

const m11 = Domain as unknown as {
  readonly COCKCROFT_GAULT_FORMULA?: TestFormulaDefinition;
  readonly FORMULA_APPROVALS?: readonly unknown[];
  readonly pendingApprovals?: (registry: object) => readonly PendingApproval[];
};

const cockcroftGault: TestFormulaDefinition = (() => {
  const formula = m11.COCKCROFT_GAULT_FORMULA;
  if (!formula) {
    throw new Error('COCKCROFT_GAULT_FORMULA export is missing.');
  }
  return formula;
})();

type SubmittedInputs = Record<
  string,
  | { readonly value: number; readonly unit: string }
  | { readonly category: string }
  | undefined
>;

function calculate(
  inputs: SubmittedInputs,
  confirmedChecks?: readonly string[],
): TestCalculationResult {
  const registry = new Domain.FormulaRegistry();
  registry.register(cockcroftGault);
  return Domain.calculateFormula(
    registry,
    request(
      cockcroftGault.formulaId,
      cockcroftGault.formulaVersion,
      inputs,
      confirmedChecks,
    ),
  );
}

function calculateOk(inputs: SubmittedInputs): TestCalculationResult {
  const result = calculate(inputs);
  expect(result.status).toBe('ok');
  return result;
}

function baseInputs(
  overrides: SubmittedInputs = {},
): Record<
  string,
  | { readonly value: number; readonly unit: string }
  | { readonly category: string }
> {
  return {
    age: { value: 60, unit: 'years' },
    weight: { value: 72, unit: 'kg' },
    creatinine: { value: 1, unit: 'mg/dL' },
    sex: { category: 'male' },
    ...overrides,
  };
}

function contractCases(): FormulaContractCases {
  const base = baseInputs();
  return {
    positive: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        base,
      ),
      expectedStatus: 'ok',
      expectedValue: 80,
    },
    negative: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          creatinine: { value: -1, unit: 'mg/dL' },
        },
      ),
      expectedStatus: 'invalid-input',
      inputId: 'creatinine',
    },
    nonFinite: [
      {
        label: 'NaN',
        request: request(
          cockcroftGault.formulaId,
          cockcroftGault.formulaVersion,
          {
            ...base,
            creatinine: { value: Number.NaN, unit: 'mg/dL' },
          },
        ),
        inputId: 'creatinine',
      },
      {
        label: 'positive infinity',
        request: request(
          cockcroftGault.formulaId,
          cockcroftGault.formulaVersion,
          {
            ...base,
            creatinine: { value: Number.POSITIVE_INFINITY, unit: 'mg/dL' },
          },
        ),
        inputId: 'creatinine',
      },
      {
        label: 'negative infinity',
        request: request(
          cockcroftGault.formulaId,
          cockcroftGault.formulaVersion,
          {
            ...base,
            creatinine: { value: Number.NEGATIVE_INFINITY, unit: 'mg/dL' },
          },
        ),
        inputId: 'creatinine',
      },
    ],
    exactMinimum: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          weight: { value: 1, unit: 'kg' },
        },
      ),
      expectedStatus: 'ok',
    },
    exactMaximum: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          weight: { value: 500, unit: 'kg' },
        },
      ),
      expectedStatus: 'ok',
    },
    outOfRange: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          weight: { value: 500.0001, unit: 'kg' },
        },
      ),
      expectedStatus: 'invalid-input',
      inputId: 'weight',
    },
    missingRequired: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          age: base.age,
          creatinine: base.creatinine,
          sex: base.sex,
        },
      ),
      expectedStatus: 'invalid-input',
      inputId: 'weight',
    },
    unitConversion: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          creatinine: { value: 88.4, unit: 'µmol/L' },
        },
      ),
      expectedStatus: 'ok',
      inputId: 'creatinine',
      expectedNormalizedValue: 1,
    },
    invalidUnit: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          creatinine: { value: 1, unit: 'g/dL' },
        },
      ),
      expectedStatus: 'unit-error',
      inputId: 'creatinine',
    },
    outOfPopulation: {
      request: request(
        cockcroftGault.formulaId,
        cockcroftGault.formulaVersion,
        {
          ...base,
          age: { value: 17, unit: 'years' },
        },
      ),
      expectedStatus: 'out-of-population',
      guardId: 'adult-age',
    },
  };
}

describeFormulaContract(cockcroftGault, contractCases());

describe('Cockcroft-Gault candidate (M11e)', () => {
  it('exports the pinned, explicitly unreviewed candidate version', () => {
    expect(cockcroftGault).toMatchObject({
      formulaId: 'crcl-cockcroft-gault',
      componentVersions: {
        formula: '1.0.0',
        population: '1.0.0',
        presentation: '1.0.0',
      },
      reviewStatus: 'unreviewed',
      output: {
        unit: 'mL/min',
        rounding: { mode: 'half-up-decimal', precision: 0 },
      },
    });
    expect(cockcroftGault.formulaVersion).toBe(
      'formula=1.0.0|population=1.0.0|presentation=1.0.0',
    );
    expect(cockcroftGault.componentVersions.classification).toBeUndefined();
    expect(cockcroftGault.componentVersions.confirmation).toBeUndefined();
    expect(cockcroftGault.classify).toBeUndefined();
    expect(cockcroftGault.softChecks ?? []).toEqual([]);
    expect(cockcroftGault.inputs.map((input) => input.id)).toEqual([
      'age',
      'weight',
      'creatinine',
      'sex',
    ]);
    const weightInput = cockcroftGault.inputs.find(
      (input) => input.id === 'weight',
    );
    expect(weightInput).toMatchObject({
      label:
        'Body weight used by the equation (actual/ideal/adjusted convention pending clinical review)',
    });
    const sexInput = cockcroftGault.inputs.find((input) => input.id === 'sex');
    expect(sexInput).toMatchObject({
      kind: 'category',
      label: 'Sex used by the equation (female × 0.85 adjustment)',
      required: true,
      options: [
        { id: 'female', label: 'Female' },
        { id: 'male', label: 'Male' },
      ],
    });
    expect(cockcroftGault.primaryReference.urlOrDoi).toContain(
      '10.1159/000180580',
    );
  });

  it('is deeply frozen so the pinned candidate cannot be mutated', () => {
    expect(Object.isFrozen(cockcroftGault)).toBe(true);
    expect(Object.isFrozen(cockcroftGault.inputs)).toBe(true);
    for (const input of cockcroftGault.inputs) {
      expect(Object.isFrozen(input)).toBe(true);
      if (input.kind === 'category') {
        expect(Object.isFrozen(input.options)).toBe(true);
      }
    }
    expect(Object.isFrozen(cockcroftGault.output.rounding)).toBe(true);
    expect(Object.isFrozen(cockcroftGault.limitations)).toBe(true);
    expect(() => {
      (cockcroftGault.limitations as string[]).push('tampered');
    }).toThrow(TypeError);
  });

  it('matches the derived fixtures within 1e-8 on the unrounded value', () => {
    for (const [sex, expected] of [
      ['male', 80],
      ['female', 68],
    ] as const) {
      const result = calculateOk(baseInputs({ sex: { category: sex } }));
      expect(result.status).toBe('ok');
      expect(
        Math.abs((result.unroundedValue ?? 0) - expected),
        `${sex} fixture`,
      ).toBeLessThan(1e-8);
    }
  });

  it('converts 88.4 µmol/L to the same value as 1 mg/dL with a visible echo', () => {
    const conventional = calculateOk(baseInputs());
    const si = calculateOk(
      baseInputs({ creatinine: { value: 88.4, unit: 'µmol/L' } }),
    );
    expect(si.unroundedValue).toBe(conventional.unroundedValue);
    const echo = si.inputEcho.find((item) => item.inputId === 'creatinine');
    expect(echo).toMatchObject({
      submittedValue: 88.4,
      submittedUnit: 'µmol/L',
      normalizedValue: 1,
      normalizedUnit: 'mg/dL',
    });
    expect(echo?.conversions.length).toBeGreaterThan(0);
    expect(echo?.conversions[0]).toMatchObject({
      fromUnit: 'µmol/L',
      toUnit: 'mg/dL',
    });
  });

  it('matches kilogram input when weight is submitted in pounds', () => {
    const metric = calculateOk(baseInputs());
    const imperial = calculateOk(
      baseInputs({ weight: { value: 72 / 0.45359237, unit: 'lb' } }),
    );
    expect(imperial.unroundedValue).toBeCloseTo(
      metric.unroundedValue ?? Number.NaN,
      12,
    );
    expect(imperial.displayValue).toBe(metric.displayValue);
    const echo = imperial.inputEcho.find((item) => item.inputId === 'weight');
    expect(echo).toMatchObject({
      normalizedUnit: 'kg',
      submittedUnit: 'lb',
    });
    expect(echo?.conversions.length).toBeGreaterThan(0);
  });

  it('echoes the selected sex option id and label', () => {
    const result = calculateOk(baseInputs({ sex: { category: 'female' } }));
    expect(
      result.inputEcho.find((item) => item.inputId === 'sex'),
    ).toMatchObject({
      submittedCategory: 'female',
      selectedOptionId: 'female',
      selectedOptionLabel: 'Female',
    });
  });

  it('accepts ages 18, 92, 93 and 130 but not 17 or 131', () => {
    const underage = calculate(
      baseInputs({ age: { value: 17, unit: 'years' } }),
    );
    expect(underage.status).toBe('out-of-population');
    expect(underage.limitsHit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guardId: 'adult-age', inputId: 'age' }),
      ]),
    );
    for (const age of [18, 92, 93, 130]) {
      expect(
        calculate(baseInputs({ age: { value: age, unit: 'years' } })).status,
        `age ${age}`,
      ).toBe('ok');
    }
    const aboveBound = calculate(
      baseInputs({ age: { value: 131, unit: 'years' } }),
    );
    expect(aboveBound.status).toBe('invalid-input');
    expect(aboveBound.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inputId: 'age', code: 'out-of-range' }),
      ]),
    );
  });

  it('rejects missing, zero and negative creatinine, unknown sex and missing weight', () => {
    const missingCreatinine = calculate({
      age: { value: 60, unit: 'years' },
      weight: { value: 72, unit: 'kg' },
      sex: { category: 'male' },
    });
    expect(missingCreatinine.status).toBe('invalid-input');
    expect(missingCreatinine.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: 'creatinine',
          code: 'missing-required',
        }),
      ]),
    );

    for (const value of [0, -1]) {
      const result = calculate(
        baseInputs({ creatinine: { value, unit: 'mg/dL' } }),
      );
      expect(result.status, `creatinine ${value}`).toBe('invalid-input');
    }

    const missingSex = calculate({
      age: { value: 60, unit: 'years' },
      weight: { value: 72, unit: 'kg' },
      creatinine: { value: 1, unit: 'mg/dL' },
    });
    expect(missingSex.status).toBe('invalid-input');
    expect(missingSex.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inputId: 'sex', code: 'missing-required' }),
      ]),
    );

    const unknownSex = calculate(baseInputs({ sex: { category: 'other' } }));
    expect(unknownSex.status).toBe('invalid-input');
    expect(unknownSex.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ inputId: 'sex' })]),
    );

    const missingWeight = calculate({
      age: { value: 60, unit: 'years' },
      creatinine: { value: 1, unit: 'mg/dL' },
      sex: { category: 'male' },
    });
    expect(missingWeight.status).toBe('invalid-input');
    expect(missingWeight.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: 'weight',
          code: 'missing-required',
        }),
      ]),
    );

    for (const value of [0, -1]) {
      const result = calculate(baseInputs({ weight: { value, unit: 'kg' } }));
      expect(result.status, `weight ${value}`).toBe('invalid-input');
    }
  });

  it('declares the technical age guard that keeps (140 - age) positive', () => {
    // Unreachable through the 0-130 technical bound today; asserted so a
    // future bound change cannot silently allow zero or negative arithmetic.
    expect(cockcroftGault.populationLimits.guards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'age-below-140',
          inputId: 'age',
          operator: 'at-most',
          value: 139,
        }),
      ]),
    );
  });

  it('presents an integer display while keeping the unrounded value', () => {
    const result = calculateOk(baseInputs());
    expect(result.unroundedValue).toBe(80);
    expect(result.displayValue).toBe(80);
    expect(Number.isInteger(result.displayValue)).toBe(true);
    expect(result.precision).toBe(0);
    expect(result.unit).toBe('mL/min');
    expect(result.rounding).toEqual({ mode: 'half-up-decimal', precision: 0 });
    expect(result.classification).toBeUndefined();
  });

  it('carries every required limitation as visible text', () => {
    const text = cockcroftGault.limitations.join(' ').toLowerCase();
    for (const fragment of [
      'unindexed creatinine clearance, not egfr',
      'not interchangeable with ckd-epi',
      'derived in 249 men aged 18-92',
      'the female × 0.85 factor was not separately derived',
      'ages above 92 are outside the derivation cohort',
      'applicability flag, not a physiological cutoff',
      'the weight convention (actual/ideal/adjusted) is pending clinical review',
      'assay-era compatibility with idms creatinine is unverified',
      'not for unstable function or aki, pregnancy, critical illness, muscle-mass extremes, amputation, children or dialysis',
      'no drug dosing is provided',
      'do not round a low serum creatinine up to 1.0',
      'display precision (integer) is proposed, pending owner sign-off',
      'technical bounds, not clinically validated',
    ]) {
      expect(text, fragment).toContain(fragment);
    }
  });

  it('lists every Cockcroft-Gault component as pending without touching approvals', () => {
    const approvals = m11.FORMULA_APPROVALS;
    expect(approvals).toBeDefined();
    if (!approvals) return;
    expect(approvals).toHaveLength(9);
    expect(
      approvals.every(
        (record) =>
          (record as { formulaId: string }).formulaId === 'bmi' ||
          (record as { formulaId: string }).formulaId === 'bsa-mosteller',
      ),
    ).toBe(true);
    expect(
      approvals.some(
        (record) =>
          (record as { formulaId: string }).formulaId ===
          'crcl-cockcroft-gault',
      ),
    ).toBe(false);
    if (!m11.pendingApprovals) {
      throw new Error('pendingApprovals export is missing.');
    }
    const registry = new Domain.FormulaRegistry();
    registry.register(cockcroftGault);
    expect(m11.pendingApprovals(registry)).toEqual([
      {
        formulaId: 'crcl-cockcroft-gault',
        formulaVersion: cockcroftGault.formulaVersion,
        component: 'formula',
        componentVersion: '1.0.0',
      },
      {
        formulaId: 'crcl-cockcroft-gault',
        formulaVersion: cockcroftGault.formulaVersion,
        component: 'population',
        componentVersion: '1.0.0',
      },
      {
        formulaId: 'crcl-cockcroft-gault',
        formulaVersion: cockcroftGault.formulaVersion,
        component: 'presentation',
        componentVersion: '1.0.0',
      },
    ]);
  });

  it('rejects registration as clinically reviewed without approvals', () => {
    const reviewed = {
      ...cockcroftGault,
      reviewStatus: {
        status: 'clinically-reviewed',
        reviewer: 'Fictional test reviewer',
        reviewedAt: '2026-01-02',
      },
    } as unknown as TestFormulaDefinition;
    expect(() =>
      new Domain.FormulaRegistry().register(
        reviewed as unknown as Domain.FormulaDefinition,
      ),
    ).toThrow(
      expect.objectContaining({
        name: 'FormulaRegistrationError',
        code: 'invalid-definition',
      }),
    );
  });
});
