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
  readonly CKD_EPI_2021_CREATININE_FORMULA?: TestFormulaDefinition;
  readonly FORMULA_APPROVALS?: readonly unknown[];
  readonly pendingApprovals?: (registry: object) => readonly PendingApproval[];
};

const ckdEpi: TestFormulaDefinition = (() => {
  const formula = m11.CKD_EPI_2021_CREATININE_FORMULA;
  if (!formula) {
    throw new Error('CKD_EPI_2021_CREATININE_FORMULA export is missing.');
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
  registry.register(ckdEpi);
  return Domain.calculateFormula(
    registry,
    request(ckdEpi.formulaId, ckdEpi.formulaVersion, inputs, confirmedChecks),
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
    creatinine: { value: 1, unit: 'mg/dL' },
    age: { value: 60, unit: 'years' },
    sex: { category: 'male' },
    ...overrides,
  };
}

function contractCases(): FormulaContractCases {
  const base = baseInputs();
  return {
    positive: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, base),
      expectedStatus: 'ok',
      expectedValue: 86,
    },
    negative: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        creatinine: { value: -1, unit: 'mg/dL' },
      }),
      expectedStatus: 'invalid-input',
      inputId: 'creatinine',
    },
    nonFinite: [
      {
        label: 'NaN',
        request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
          ...base,
          creatinine: { value: Number.NaN, unit: 'mg/dL' },
        }),
        inputId: 'creatinine',
      },
      {
        label: 'positive infinity',
        request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
          ...base,
          creatinine: { value: Number.POSITIVE_INFINITY, unit: 'mg/dL' },
        }),
        inputId: 'creatinine',
      },
      {
        label: 'negative infinity',
        request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
          ...base,
          creatinine: { value: Number.NEGATIVE_INFINITY, unit: 'mg/dL' },
        }),
        inputId: 'creatinine',
      },
    ],
    exactMinimum: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        creatinine: { value: 0.1, unit: 'mg/dL' },
      }),
      expectedStatus: 'ok',
    },
    exactMaximum: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        creatinine: { value: 20, unit: 'mg/dL' },
      }),
      expectedStatus: 'ok',
    },
    outOfRange: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        creatinine: { value: 20.0001, unit: 'mg/dL' },
      }),
      expectedStatus: 'invalid-input',
      inputId: 'creatinine',
    },
    missingRequired: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        age: base.age,
        sex: base.sex,
      }),
      expectedStatus: 'invalid-input',
      inputId: 'creatinine',
    },
    unitConversion: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        creatinine: { value: 88.4, unit: 'µmol/L' },
      }),
      expectedStatus: 'ok',
      inputId: 'creatinine',
      expectedNormalizedValue: 1,
    },
    invalidUnit: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        creatinine: { value: 1, unit: 'g/dL' },
      }),
      expectedStatus: 'unit-error',
      inputId: 'creatinine',
    },
    outOfPopulation: {
      request: request(ckdEpi.formulaId, ckdEpi.formulaVersion, {
        ...base,
        age: { value: 17, unit: 'years' },
      }),
      expectedStatus: 'out-of-population',
      guardId: 'adult-age',
    },
  };
}

describeFormulaContract(ckdEpi, contractCases());

describe('CKD-EPI 2021 creatinine candidate (M11d)', () => {
  it('exports the pinned, explicitly unreviewed candidate version', () => {
    expect(ckdEpi).toMatchObject({
      formulaId: 'egfr-ckd-epi-2021-cr',
      componentVersions: {
        formula: '1.0.0',
        population: '1.0.0',
        presentation: '1.1.0',
      },
      reviewStatus: 'unreviewed',
      output: {
        unit: 'mL/min/1.73 m²',
        rounding: { mode: 'half-up-decimal', precision: 0 },
      },
    });
    expect(ckdEpi.formulaVersion).toBe(
      'formula=1.0.0|population=1.0.0|presentation=1.1.0',
    );
    expect(ckdEpi.componentVersions.classification).toBeUndefined();
    expect(ckdEpi.componentVersions.confirmation).toBeUndefined();
    expect(ckdEpi.classify).toBeUndefined();
    expect(ckdEpi.softChecks ?? []).toEqual([]);
    expect(ckdEpi.inputs.map((input) => input.id)).toEqual([
      'creatinine',
      'age',
      'sex',
    ]);
    const sexInput = ckdEpi.inputs.find((input) => input.id === 'sex');
    expect(sexInput).toMatchObject({
      kind: 'category',
      label: 'Sex coefficient used by the equation (female/male)',
      required: true,
      options: [
        { id: 'female', label: 'Female' },
        { id: 'male', label: 'Male' },
      ],
    });
    expect(sexInput).not.toHaveProperty('default');
    expect(sexInput).not.toHaveProperty('defaultOption');
    expect(ckdEpi.primaryReference.urlOrDoi).toContain('10.1056/NEJMoa2102953');
  });

  it('is deeply frozen so the pinned candidate cannot be mutated', () => {
    expect(Object.isFrozen(ckdEpi)).toBe(true);
    expect(Object.isFrozen(ckdEpi.inputs)).toBe(true);
    for (const input of ckdEpi.inputs) {
      expect(Object.isFrozen(input)).toBe(true);
      if (input.kind === 'category') {
        expect(Object.isFrozen(input.options)).toBe(true);
      }
    }
    expect(Object.isFrozen(ckdEpi.output.rounding)).toBe(true);
    expect(Object.isFrozen(ckdEpi.limitations)).toBe(true);
    expect(() => {
      (ckdEpi.limitations as string[]).push('tampered');
    }).toThrow(TypeError);
  });

  it('matches the derived fixtures within 1e-8 on the unrounded value', () => {
    const vectors = [
      { age: 60, scr: 1, sex: 'male', expected: 86.1626207797 },
      { age: 60, scr: 1, sex: 'female', expected: 64.4950003539 },
      { age: 60, scr: 0.9, sex: 'male', expected: 97.7750144829 },
      { age: 60, scr: 0.7, sex: 'female', expected: 98.9483146567 },
    ] as const;
    for (const vector of vectors) {
      const result = calculateOk(
        baseInputs({
          creatinine: { value: vector.scr, unit: 'mg/dL' },
          age: { value: vector.age, unit: 'years' },
          sex: { category: vector.sex },
        }),
      );
      expect(result.status).toBe('ok');
      expect(
        Math.abs((result.unroundedValue ?? 0) - vector.expected),
        `${vector.sex} Scr ${vector.scr}`,
      ).toBeLessThan(1e-8);
    }
  });

  it('is continuous at each sex knot within 1e-6 relative', () => {
    for (const [sex, kappa] of [
      ['male', 0.9],
      ['female', 0.7],
    ] as const) {
      const below = calculateOk(
        baseInputs({
          creatinine: { value: kappa - 1e-9, unit: 'mg/dL' },
          sex: { category: sex },
        }),
      );
      const above = calculateOk(
        baseInputs({
          creatinine: { value: kappa + 1e-9, unit: 'mg/dL' },
          sex: { category: sex },
        }),
      );
      const low = below.unroundedValue ?? Number.NaN;
      const high = above.unroundedValue ?? Number.NaN;
      expect(Math.abs(low - high) / Math.max(1, Math.abs(low))).toBeLessThan(
        1e-6,
      );
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

  it('routes age 17 through the adult guard and accepts age 18', () => {
    const underage = calculate(
      baseInputs({ age: { value: 17, unit: 'years' } }),
    );
    expect(underage.status).toBe('out-of-population');
    expect(underage.limitsHit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guardId: 'adult-age', inputId: 'age' }),
      ]),
    );
    expect(
      calculate(baseInputs({ age: { value: 18, unit: 'years' } })).status,
    ).toBe('ok');
  });

  it('rejects missing, unknown, and mismatched categorical and creatinine inputs', () => {
    const missingCreatinine = calculate({
      age: { value: 60, unit: 'years' },
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

    const missingSex = calculate({
      creatinine: { value: 1, unit: 'mg/dL' },
      age: { value: 60, unit: 'years' },
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

    for (const value of [0, -1]) {
      const result = calculate(
        baseInputs({ creatinine: { value, unit: 'mg/dL' } }),
      );
      expect(result.status, `creatinine ${value}`).toBe('invalid-input');
    }

    for (const value of [0.099, 20.0001]) {
      const result = calculate(
        baseInputs({ creatinine: { value, unit: 'mg/dL' } }),
      );
      expect(result.status, `creatinine ${value}`).toBe('invalid-input');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            inputId: 'creatinine',
            code: 'out-of-range',
          }),
        ]),
      );
    }
  });

  it('presents an integer display while keeping the unrounded value', () => {
    const result = calculateOk(baseInputs());
    expect(result.unroundedValue).toBeCloseTo(86.1626207797, 8);
    expect(result.displayValue).toBe(86);
    expect(Number.isInteger(result.displayValue)).toBe(true);
    expect(result.precision).toBe(0);
    expect(result.rounding).toEqual({ mode: 'half-up-decimal', precision: 0 });
    expect(result.classification).toBeUndefined();
  });

  it('carries every required limitation as visible text', () => {
    const text = ckdEpi.limitations.join(' ').toLowerCase();
    for (const fragment of [
      'candidate equation for stable adult kidney function only',
      'not for acute kidney injury, unstable creatinine, dialysis or pregnancy',
      'extreme muscle mass',
      'malnutrition',
      'other conditions impairing accuracy',
      'idms-traceable creatinine assay',
      'cystatin c equations are separate and not implemented',
      'not cockcroft',
      'not for dosing',
      'de-indexing by bsa does not authorise dosing',
      'no ckd diagnosis or staging from a single value',
      'not validated specifically for the romanian population',
      'no population-specific precision is claimed',
      'published female/male coefficients are used without an ethnicity adjustment',
      'accuracy may be limited when creatinine generation differs substantially',
      'hormonal or muscle-mass changes',
      'displayed as a whole number; the unrounded value is kept internally and is never used for later calculations or threshold decisions',
      'technical bounds, not clinically validated',
      'creatinine 0.1-20 mg/dl (8.84-1768 µmol/l)',
    ]) {
      expect(text, fragment).toContain(fragment);
    }
    expect(text).not.toContain('proposed');
    expect(text).not.toContain('pending owner sign-off');
  });

  it('lists only presentation 1.1.0 as pending after the formula and population approvals', () => {
    const approvals = m11.FORMULA_APPROVALS;
    expect(approvals).toBeDefined();
    if (!approvals) return;
    expect(approvals).toHaveLength(16);
    expect(
      approvals.filter(
        (record) =>
          (record as { formulaId: string }).formulaId ===
          'egfr-ckd-epi-2021-cr',
      ),
    ).toHaveLength(2);
    if (!m11.pendingApprovals) {
      throw new Error('pendingApprovals export is missing.');
    }
    const registry = new Domain.FormulaRegistry();
    registry.register(ckdEpi);
    expect(m11.pendingApprovals(registry)).toEqual([
      {
        formulaId: 'egfr-ckd-epi-2021-cr',
        formulaVersion: ckdEpi.formulaVersion,
        component: 'presentation',
        componentVersion: '1.1.0',
      },
    ]);
  });

  it('rejects registration as clinically reviewed without approvals', () => {
    const reviewed = {
      ...ckdEpi,
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
