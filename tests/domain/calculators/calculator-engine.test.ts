import { describe, expect, it, vi } from 'vitest';
import * as Domain from '@intermed/domain';
import {
  calculateWith,
  createFormulaRegistry,
  describeFormulaContract,
  request,
  type TestFormulaDefinition,
  type TestUnitConversion,
} from './describe-formula-contract';
import {
  commonCases,
  divergentNarrow,
  divergentWide,
  guarded,
  linear,
  makeDefinition,
  newerVersion,
  olderVersion,
  optional,
  throwing,
} from './calculator-fixtures';

const calculatorEngine = Domain as unknown as {
  readonly FormulaRegistry: new () => object;
  readonly calculateFormula: (registry: object, request: object) => unknown;
  readonly STANDARD_UNIT_CONVERSIONS: Readonly<
    Record<string, readonly TestUnitConversion[]>
  >;
};

describe('calculator engine public API', () => {
  it('exports the pinned formula registry and calculation function', () => {
    expect(calculatorEngine.FormulaRegistry).toBeTypeOf('function');
    expect(calculatorEngine.calculateFormula).toBeTypeOf('function');
  });
});

describeFormulaContract(linear, {
  ...commonCases(linear, { expectedPositiveValue: 50 }),
});
describeFormulaContract(guarded, {
  ...commonCases(guarded, {
    expectedPositiveValue: 36.67,
    concentrationUnit: 'µmol/L',
  }),
});
describeFormulaContract(optional, {
  ...commonCases(optional, { expectedPositiveValue: 50 }),
});
describeFormulaContract(olderVersion, commonCases(olderVersion));
describeFormulaContract(newerVersion, commonCases(newerVersion));
describeFormulaContract(
  throwing,
  commonCases(throwing, {
    expectedPositiveStatus: 'unavailable',
    expectedConversionStatus: 'unavailable',
  }),
);
describeFormulaContract(divergentNarrow, {
  ...commonCases(divergentNarrow, { expectedPositiveValue: 50 }),
  submittedInRangeCanonicalOut: {
    request: request(divergentNarrow.formulaId, divergentNarrow.formulaVersion, {
      'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
      'synthetic-concentration': { value: 800, unit: 'µmol/L' },
    }),
    expectedStatus: 'invalid-input',
    inputId: 'synthetic-concentration',
    canonicalUnit: 'mg/dL',
  },
});
describeFormulaContract(divergentWide, {
  ...commonCases(divergentWide, { expectedPositiveValue: 50 }),
  submittedOutOfRangeCanonicalIn: {
    request: request(divergentWide.formulaId, divergentWide.formulaVersion, {
      'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
      'synthetic-concentration': { value: 2500, unit: 'µmol/L' },
    }),
    expectedStatus: 'invalid-input',
    inputId: 'synthetic-concentration',
  },
});

describe('calculator registry and result provenance', () => {
  it('requires an explicit id and version without substituting a registered version', () => {
    const registry = createFormulaRegistry();
    registry.register(olderVersion);
    registry.register(newerVersion);
    const result = calculateWith(
      registry,
      request('synthetic-versioned', '3.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
      }),
    );

    expect(result.status).toBe('unavailable');
    expect(result.formulaId).toBe('synthetic-versioned');
    expect(result.formulaVersion).toBe('3.0');
    expect(result.primaryReference).toBeNull();
    expect(result.reviewStatus).toBeNull();
    expect(result.reviewMarker).toBe('UNAVAILABLE');
    expect(result).toHaveProperty('limitations');
    expect(result).toHaveProperty('inputEcho');
    expect(result.inputEcho).toEqual([]);
  });

  it('lists registered versions explicitly without selecting one as latest', () => {
    const registry = createFormulaRegistry();
    registry.register(newerVersion);
    registry.register(olderVersion);

    expect(registry.listVersions('synthetic-versioned')).toEqual([
      { version: '2.0', deprecated: false },
      {
        version: '1.0',
        deprecated: true,
        deprecationNotice: 'This fictional test version is deprecated.',
      },
    ]);
    expect(registry.get('synthetic-versioned', '1.0')).toBeDefined();
    expect(registry.get('synthetic-versioned', '2.0')).toBeDefined();
  });

  it('rejects duplicate id/version registration instead of replacing a formula', () => {
    const registry = createFormulaRegistry();
    registry.register(olderVersion);
    expect(() => registry.register(olderVersion)).toThrow();
  });

  it('rejects registration with an empty population guard list', () => {
    const definition: TestFormulaDefinition = {
      ...linear,
      formulaId: 'synthetic-no-guards',
      populationLimits: {
        text: linear.populationLimits.text,
        guards: [],
      },
    };
    const registry = createFormulaRegistry();
    let error: unknown;
    try {
      registry.register(definition);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      name: 'FormulaRegistrationError',
      code: 'invalid-definition',
    });
  });

  it('rejects a guard with an unknown operator at registration', () => {
    const unknownGuard = {
      id: 'synthetic-unknown-guard',
      inputId: 'synthetic-concentration',
      operator: 'greater-than',
      value: 10,
      unit: 'mg/dL',
      message: 'Fictional test guard only.',
    };
    const definition = {
      ...linear,
      formulaId: 'synthetic-unknown-guard',
      populationLimits: {
        text: linear.populationLimits.text,
        guards: [unknownGuard],
      },
    };
    const registry = createFormulaRegistry();
    let error: unknown;
    try {
      registry.register(definition as unknown as TestFormulaDefinition);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      name: 'FormulaRegistrationError',
      code: 'invalid-definition',
    });
  });

  it('rejects a conversion factor that disagrees with the standard table', () => {
    const base = makeDefinition({
      id: 'synthetic-standard-typo',
      version: '1.0',
    });
    const axisInput = base.inputs.find((item) => item.id === 'synthetic-axis');
    if (!axisInput) throw new Error('Synthetic fixture input is missing.');
    const concentrationInput = base.inputs.find(
      (item) => item.id === 'synthetic-concentration',
    );
    if (!concentrationInput) {
      throw new Error('Synthetic fixture input is missing.');
    }
    const massInput = {
      ...axisInput,
      quantityKind: 'mass',
      canonicalUnit: 'kg',
      allowedUnits: ['kg', 'lb'],
      plausibleRangeByUnit: {
        kg: { min: 0, max: 100 },
        lb: { min: 0, max: 220 },
      },
    };
    const drift = 1 + 1e-9;
    const formula: TestFormulaDefinition = {
      ...base,
      formulaId: 'synthetic-standard-typo',
      inputs: [massInput, concentrationInput],
      unitConversions: {
        ...base.unitConversions,
        mass: [
          { fromUnit: 'kg', toUnit: 'lb', factor: 2.2046226218487757 * drift },
          { fromUnit: 'lb', toUnit: 'kg', factor: 0.45359237 / drift },
        ],
      },
    };
    const registry = createFormulaRegistry();
    let error: unknown;
    try {
      registry.register(formula);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      name: 'FormulaRegistrationError',
      code: 'invalid-definition',
    });
  });

  it('rejects declared inverses that are not round-trip consistent', () => {
    const base = makeDefinition({
      id: 'synthetic-bad-inverse',
      version: '1.0',
    });
    const formula: TestFormulaDefinition = {
      ...base,
      formulaId: 'synthetic-bad-inverse',
      unitConversions: {
        ...base.unitConversions,
        'synthetic-concentration': [
          { fromUnit: 'µmol/L', toUnit: 'mg/dL', factor: 7.321 },
          { fromUnit: 'mg/dL', toUnit: 'µmol/L', factor: 1 / 7.5 },
        ],
      },
    };
    const registry = createFormulaRegistry();
    let error: unknown;
    try {
      registry.register(formula);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      name: 'FormulaRegistrationError',
      code: 'invalid-definition',
    });
  });

  it('rejects a direct pair that disagrees with its composed chain', () => {
    const base = makeDefinition({
      id: 'synthetic-bad-chain',
      version: '1.0',
    });
    const chainInput = {
      id: 'synthetic-chain',
      label: 'Fictional input synthetic-chain',
      quantityKind: 'synthetic-chain',
      canonicalUnit: 'synthetic-unit-c',
      allowedUnits: [
        'synthetic-unit-a',
        'synthetic-unit-b',
        'synthetic-unit-c',
      ],
      plausibleRangeByUnit: {
        'synthetic-unit-a': { min: 0, max: 100 },
        'synthetic-unit-b': { min: 0, max: 100 },
        'synthetic-unit-c': { min: 0, max: 100 },
      },
      required: false,
    };
    const formula: TestFormulaDefinition = {
      ...base,
      formulaId: 'synthetic-bad-chain',
      inputs: [...base.inputs, chainInput],
      unitConversions: {
        ...base.unitConversions,
        'synthetic-chain': [
          { fromUnit: 'synthetic-unit-a', toUnit: 'synthetic-unit-b', factor: 2 },
          { fromUnit: 'synthetic-unit-b', toUnit: 'synthetic-unit-c', factor: 3 },
          { fromUnit: 'synthetic-unit-a', toUnit: 'synthetic-unit-c', factor: 7 },
        ],
      },
    };
    const registry = createFormulaRegistry();
    let error: unknown;
    try {
      registry.register(formula);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      name: 'FormulaRegistrationError',
      code: 'invalid-definition',
    });
  });

  it('returns unavailable when a stored guard has an unknown operator', () => {
    const registry = createFormulaRegistry();
    registry.register(linear);
    const internal = registry as unknown as {
      definitions: Map<string, Record<string, unknown>>;
    };
    const key = JSON.stringify([linear.formulaId, linear.formulaVersion]);
    const stored = internal.definitions.get(key);
    if (!stored) throw new Error('Synthetic fixture is missing.');
    const limits = stored['populationLimits'] as {
      text: string;
      guards: readonly Record<string, unknown>[];
    };
    const tampered = {
      ...stored,
      populationLimits: {
        text: limits.text,
        guards: [{ ...limits.guards[0], operator: 'greater-than' }],
      },
    };
    internal.definitions.set(key, tampered);
    const result = calculateWith(
      registry,
      request('synthetic-linear', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );
    expect(result.status).toBe('unavailable');
  });

  it('rejects malformed runtime definitions with structured registration errors', () => {
    const malformedDefinitions: unknown[] = [
      { ...linear, inputs: [null, ...linear.inputs.slice(1)] },
      {
        ...linear,
        unitConversions: {
          ...linear.unitConversions,
          'synthetic-concentration': [null],
        },
      },
      { ...linear, output: null },
    ];

    for (const definition of malformedDefinitions) {
      const registry = createFormulaRegistry();
      let error: unknown;
      try {
        registry.register(definition as TestFormulaDefinition);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: 'FormulaRegistrationError',
        code: 'invalid-definition',
      });
    }
  });

  it('keeps a registration-time snapshot of plausible input ranges', () => {
    const formula = makeDefinition({
      id: 'synthetic-pinned-range',
      version: '1.0',
    });
    const axisInput = formula.inputs.find(
      (item) => item.id === 'synthetic-axis',
    );
    if (!axisInput) throw new Error('Synthetic fixture input is missing.');
    const range = axisInput.plausibleRangeByUnit['synthetic-unit'];
    if (!range) throw new Error('Synthetic fixture range is missing.');
    const registry = createFormulaRegistry();
    registry.register(formula);
    (range as { min: number; max: number }).max = 35;

    const result = calculateWith(
      registry,
      request(formula.formulaId, formula.formulaVersion, {
        'synthetic-axis': { value: 40, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.status).toBe('ok');
  });

  it('resolves a pinned deprecated version and includes its notice in the result', () => {
    const registry = createFormulaRegistry();
    registry.register(olderVersion);
    registry.register(newerVersion);
    const result = calculateWith(
      registry,
      request('synthetic-versioned', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.status).toBe('ok');
    expect(result.formulaVersion).toBe('1.0');
    expect(result.deprecationNotice).toBe(
      'This fictional test version is deprecated.',
    );
    expect(result.displayValue).toBe(90);
  });

  it('rounds only the display value and retains the unrounded result', () => {
    const registry = createFormulaRegistry();
    registry.register(linear);
    const result = calculateWith(
      registry,
      request('synthetic-linear', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 55, unit: 'mg/dL' },
      }),
    );

    expect(result.status).toBe('ok');
    expect(result.unroundedValue).toBeCloseTo(48.333333333333336);
    expect(result.displayValue).toBe(48.33);
    expect(result.unit).toBe('imaginary-output-unit');
    expect(result.rounding).toEqual({
      mode: 'half-away-from-zero',
      precision: 2,
      roundingRuleReviewed: false,
    });
  });

  it('makes the unreviewed marker explicit on every result', () => {
    const registry = createFormulaRegistry();
    registry.register(linear);
    const result = calculateWith(
      registry,
      request('synthetic-linear', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.reviewStatus).toBe('unreviewed');
    expect(result.reviewMarker).toBe('UNREVIEWED');
  });

  it('includes reviewer and date metadata for a test-only reviewed status', () => {
    const reviewedFixture = makeDefinition({
      id: 'synthetic-review-metadata',
      version: '1.0',
      reviewStatus: {
        status: 'clinically-reviewed',
        reviewer: 'Fictional test reviewer',
        reviewedAt: '2026-01-02',
      },
    });
    const registry = createFormulaRegistry();
    registry.register(reviewedFixture);
    const result = calculateWith(
      registry,
      request(reviewedFixture.formulaId, reviewedFixture.formulaVersion, {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.reviewStatus).toEqual(reviewedFixture.reviewStatus);
    expect(result.reviewMarker).toBe('CLINICALLY REVIEWED');
  });

  it('does not return patient identifiers or other request metadata', () => {
    const registry = createFormulaRegistry();
    registry.register(linear);
    const untrustedRequest = {
      ...request('synthetic-linear', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
      patientId: 'synthetic-patient-identifier-must-not-escape',
      patientIdentifier: 'second-synthetic-identifier-must-not-escape',
    };
    const result = calculateWith(registry, untrustedRequest);

    expect(JSON.stringify(result)).not.toContain(
      'synthetic-patient-identifier',
    );
    expect(JSON.stringify(result)).not.toContain('second-synthetic-identifier');
    expect(result).not.toHaveProperty('patientId');
    expect(result).not.toHaveProperty('patientIdentifier');
  });

  it('does not log thrown formula errors or expose the exception message', () => {
    const registry = createFormulaRegistry();
    registry.register(throwing);
    const logSpies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
      vi.spyOn(console, 'trace'),
    ];
    const result = calculateWith(
      registry,
      request('synthetic-throwing', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('private input');
    expect(logSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    logSpies.forEach((spy) => spy.mockRestore());
  });

  it('provides explicit standard mass and length conversion pairs only', () => {
    const conversions = calculatorEngine.STANDARD_UNIT_CONVERSIONS;
    expect(conversions.mass).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromUnit: 'kg', toUnit: 'lb' }),
        expect.objectContaining({ fromUnit: 'lb', toUnit: 'kg' }),
      ]),
    );
    expect(conversions.length).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromUnit: 'cm', toUnit: 'm' }),
        expect.objectContaining({ fromUnit: 'm', toUnit: 'cm' }),
        expect.objectContaining({ fromUnit: 'cm', toUnit: 'in' }),
        expect.objectContaining({ fromUnit: 'in', toUnit: 'cm' }),
        expect.objectContaining({ fromUnit: 'm', toUnit: 'in' }),
        expect.objectContaining({ fromUnit: 'in', toUnit: 'm' }),
      ]),
    );
    expect(conversions).not.toHaveProperty('synthetic-concentration');
    expect(
      conversions.mass?.find((rule) => rule.fromUnit === 'kg')?.factor,
    ).toBe(2.2046226218487757);
    expect(
      conversions.length?.find(
        (rule) => rule.fromUnit === 'cm' && rule.toUnit === 'in',
      )?.factor,
    ).toBe(1 / 2.54);
  });

  it('applies a standard conversion only when the formula declares its unit map', () => {
    const base = makeDefinition({
      id: 'synthetic-standard-mass',
      version: '1.0',
    });
    const axisInput = base.inputs.find((item) => item.id === 'synthetic-axis');
    if (!axisInput) throw new Error('Synthetic fixture input is missing.');
    const concentrationInput = base.inputs.find(
      (item) => item.id === 'synthetic-concentration',
    );
    if (!concentrationInput) {
      throw new Error('Synthetic fixture input is missing.');
    }
    const massInput = {
      ...axisInput,
      quantityKind: 'mass',
      canonicalUnit: 'kg',
      allowedUnits: ['kg', 'lb'],
      plausibleRangeByUnit: {
        kg: { min: 0, max: 100 },
        lb: { min: 0, max: 220 },
      },
    };
    const formula: TestFormulaDefinition = {
      ...base,
      inputs: [massInput, concentrationInput],
      unitConversions: {
        ...base.unitConversions,
        mass: calculatorEngine.STANDARD_UNIT_CONVERSIONS.mass ?? [],
      },
      compute: (values) => values['synthetic-axis'] ?? 0,
    };
    const registry = createFormulaRegistry();
    registry.register(formula);
    const result = calculateWith(
      registry,
      request(formula.formulaId, formula.formulaVersion, {
        'synthetic-axis': {
          value: 2.2046226218487757,
          unit: 'lb',
        },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.status).toBe('ok');
    expect(result.unroundedValue).toBeCloseTo(1);
    expect(
      result.inputEcho.find((echo) => echo.inputId === 'synthetic-axis'),
    ).toMatchObject({
      submittedUnit: 'lb',
      normalizedUnit: 'kg',
      normalizedValue: 1,
      conversions: [expect.objectContaining({ fromUnit: 'lb', toUnit: 'kg' })],
    });
  });

  it('rounds decimal ties by their stored binary value', () => {
    for (const [value, expected] of [
      [1.005, 1],
      [-1.005, -1],
    ] as const) {
      const formula = makeDefinition({
        id: `synthetic-rounding-${expected < 0 ? 'negative' : 'positive'}`,
        version: '1.0',
        compute: () => value,
      });
      const registry = createFormulaRegistry();
      registry.register(formula);
      const result = calculateWith(
        registry,
        request(formula.formulaId, formula.formulaVersion, {
          'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
          'synthetic-concentration': { value: 60, unit: 'mg/dL' },
        }),
      );
      expect(result.status).toBe('ok');
      expect(result.displayValue).toBe(expected);
    }
  });

  it('rounds half away from zero on the exact binary value', () => {
    const table = [
      { value: 0.49999999999999994, precision: 0, expected: 0 },
      { value: 2.5, precision: 0, expected: 3 },
      { value: -2.5, precision: 0, expected: -3 },
      { value: 2.675, precision: 2, expected: 2.67 },
      { value: 1.005, precision: 2, expected: 1 },
    ] as const;
    for (const { value, precision, expected } of table) {
      const formula = makeDefinition({
        id: 'synthetic-binary-rounding',
        version: '1.0',
        outputPrecision: precision,
        compute: () => value,
      });
      const registry = createFormulaRegistry();
      registry.register(formula);
      const result = calculateWith(
        registry,
        request(formula.formulaId, formula.formulaVersion, {
          'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
          'synthetic-concentration': { value: 60, unit: 'mg/dL' },
        }),
      );
      expect(result.status).toBe('ok');
      expect(result.displayValue).toBe(expected);
      expect(result.rounding).toEqual({
        mode: 'half-away-from-zero',
        precision,
        roundingRuleReviewed: false,
      });
    }
  });

  it('matches exact binary rounding over a rounding table', () => {
    // Expectations below are half-away-from-zero applied to the exact
    // stored binary value at precision 2. Note 123.455 gives 123.45: the
    // stored double sits just below the tie even though 123.455 * 100
    // evaluates to exactly 12345.5 in floating point.
    const table = [
      { value: 0.125, expected: 0.13 },
      { value: -0.125, expected: -0.13 },
      { value: 1.005, expected: 1 },
      { value: -1.005, expected: -1 },
      { value: 2.675, expected: 2.67 },
      { value: -2.675, expected: -2.67 },
      { value: 123.455, expected: 123.45 },
      { value: 0.335, expected: 0.34 },
      { value: 999.995, expected: 1000 },
      { value: 2.5, expected: 2.5 },
      { value: -2.5, expected: -2.5 },
      { value: 0.49999999999999994, expected: 0.5 },
      { value: 48.333333333333336, expected: 48.33 },
    ];
    for (const { value, expected } of table) {
      const formula = makeDefinition({
        id: 'synthetic-rounding-table',
        version: '1.0',
        compute: () => value,
      });
      const registry = createFormulaRegistry();
      registry.register(formula);
      const result = calculateWith(
        registry,
        request(formula.formulaId, formula.formulaVersion, {
          'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
          'synthetic-concentration': { value: 60, unit: 'mg/dL' },
        }),
      );
      expect(result.status).toBe('ok');
      expect(result.displayValue).toBe(expected);
    }
  });

  it('classifies from the unrounded value, not the display value', () => {
    const classify = vi.fn((unroundedValue: number) =>
      unroundedValue < 25
        ? { code: 'below-25', label: 'Fictional below category.' }
        : { code: 'at-or-above-25', label: 'Fictional above category.' },
    );
    const formula: TestFormulaDefinition = {
      ...makeDefinition({
        id: 'synthetic-classification',
        version: '1.0',
      }),
      formulaId: 'synthetic-classification',
      compute: () => 24.999999,
      classify,
    };
    const registry = createFormulaRegistry();
    registry.register(formula);
    const result = calculateWith(
      registry,
      request('synthetic-classification', '1.0', {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 60, unit: 'mg/dL' },
      }),
    );

    expect(result.status).toBe('ok');
    expect(result.unroundedValue).toBe(24.999999);
    expect(result.displayValue).toBe(25);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledWith(24.999999);
    expect(result.classification).toEqual({
      code: 'below-25',
      label: 'Fictional below category.',
    });
  });

  it('does not call compute when a population guard is hit', () => {
    const compute = vi.fn(
      (values: Readonly<Record<string, number | undefined>>) =>
        (values['synthetic-axis'] ?? 0) +
        (values['synthetic-concentration'] ?? 0),
    );
    const formula: TestFormulaDefinition = { ...guarded, compute };
    const registry = createFormulaRegistry();
    registry.register(formula);
    const result = calculateWith(
      registry,
      request(formula.formulaId, formula.formulaVersion, {
        'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
        'synthetic-concentration': { value: 5, unit: 'µmol/L' },
      }),
    );

    expect(result.status).toBe('out-of-population');
    expect(compute).not.toHaveBeenCalled();
  });
});
