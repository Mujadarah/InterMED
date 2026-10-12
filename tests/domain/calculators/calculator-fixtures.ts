import type {
  FormulaContractCases,
  TestCalculationResult,
  TestFormulaDefinition,
  TestInputDefinition,
  TestUnitConversion,
} from './describe-formula-contract';
import { request } from './describe-formula-contract';

// This invented factor exists only in synthetic tests, not in the domain engine.
export const SYNTHETIC_CONVERSION_FACTOR = 7.321;

const syntheticConversions: Readonly<
  Record<string, readonly TestUnitConversion[]>
> = {
  'synthetic-concentration': [
    {
      fromUnit: 'µmol/L',
      toUnit: 'mg/dL',
      factor: SYNTHETIC_CONVERSION_FACTOR,
    },
    {
      fromUnit: 'mg/dL',
      toUnit: 'µmol/L',
      factor: 1 / SYNTHETIC_CONVERSION_FACTOR,
    },
  ],
};

function input(
  id: string,
  options: {
    readonly required?: boolean;
    readonly quantityKind?: string;
    readonly canonicalUnit?: string;
    readonly allowedUnits?: readonly string[];
    readonly rangeByUnit?: Readonly<
      Record<string, { readonly min: number; readonly max: number }>
    >;
  } = {},
): TestInputDefinition {
  const allowedUnits = options.allowedUnits ?? ['synthetic-unit'];
  return {
    id,
    label: `Fictional input ${id}`,
    quantityKind: options.quantityKind ?? 'synthetic-axis',
    canonicalUnit: options.canonicalUnit ?? allowedUnits[0] ?? 'synthetic-unit',
    allowedUnits,
    plausibleRangeByUnit:
      options.rangeByUnit ??
      Object.fromEntries(
        allowedUnits.map((unit) => [unit, { min: 0, max: 100 }]),
      ),
    required: options.required ?? true,
  };
}

export function makeDefinition(options: {
  readonly id: string;
  readonly version: string;
  readonly compute?: TestFormulaDefinition['compute'];
  readonly includeOptional?: boolean;
  readonly canonicalConcentrationUnit?: 'mg/dL' | 'µmol/L';
  readonly deprecated?: string;
  readonly reviewStatus?: TestFormulaDefinition['reviewStatus'];
  readonly outputPrecision?: number;
}): TestFormulaDefinition {
  const canonicalUnit = options.canonicalConcentrationUnit ?? 'mg/dL';
  const concentrationInput = input('synthetic-concentration', {
    quantityKind: 'synthetic-concentration',
    canonicalUnit,
    allowedUnits: ['mg/dL', 'µmol/L'],
    rangeByUnit: {
      'mg/dL': { min: 0, max: 2000 },
      'µmol/L': { min: 0, max: 2000 },
    },
  });
  const inputs = [
    input('synthetic-axis'),
    concentrationInput,
    ...(options.includeOptional
      ? [input('synthetic-optional', { required: false })]
      : []),
  ];
  return {
    formulaId: options.id,
    formulaVersion: options.version,
    title: `Synthetic-only ${options.id} ${options.version}`,
    primaryReference: {
      citation: `Fictional test reference for ${options.id} ${options.version}`,
      urlOrDoi: `https://example.invalid/${options.id}/${options.version}`,
    },
    inputs,
    unitConversions: syntheticConversions,
    output: {
      unit: 'imaginary-output-unit',
      precision: options.outputPrecision ?? 2,
    },
    populationLimits: {
      text: 'Synthetic test values only; these limits are fictional.',
      guards: [
        {
          id: 'synthetic-population-window',
          inputId: 'synthetic-concentration',
          operator: 'between',
          minimum: 10,
          maximum: 190,
          unit: canonicalUnit,
          message: 'Fictional test range only.',
        },
      ],
    },
    limitations: ['Synthetic test fixture only; not for clinical use.'],
    reviewStatus: options.reviewStatus ?? 'unreviewed',
    ...(options.deprecated
      ? { deprecated: { notice: options.deprecated } }
      : {}),
    compute:
      options.compute ??
      ((values) => {
        const axis = values['synthetic-axis'];
        const concentration = values['synthetic-concentration'];
        if (axis === undefined || concentration === undefined) {
          throw new Error('Synthetic required input is missing.');
        }
        return axis + concentration / 3;
      }),
  };
}

interface CommonFormulaInputs {
  readonly id: string;
  readonly version: string;
  readonly canonicalUnit: 'mg/dL' | 'µmol/L';
  readonly alternateUnit: 'mg/dL' | 'µmol/L';
  readonly expectedConcentration: number;
  readonly alternateValue: number;
  readonly baseInputs: {
    readonly 'synthetic-axis': {
      readonly value: number;
      readonly unit: string;
    };
    readonly 'synthetic-concentration': {
      readonly value: number;
      readonly unit: string;
    };
  };
}

function commonFormulaInputs(
  definition: TestFormulaDefinition,
  canonicalUnit: 'mg/dL' | 'µmol/L',
): CommonFormulaInputs {
  const expectedConcentration = 60;
  const alternateUnit = canonicalUnit === 'mg/dL' ? 'µmol/L' : 'mg/dL';
  const alternateValue =
    canonicalUnit === 'mg/dL'
      ? expectedConcentration / SYNTHETIC_CONVERSION_FACTOR
      : expectedConcentration * SYNTHETIC_CONVERSION_FACTOR;
  return {
    id: definition.formulaId,
    version: definition.formulaVersion,
    canonicalUnit,
    alternateUnit,
    expectedConcentration,
    alternateValue,
    baseInputs: {
      'synthetic-axis': { value: 30, unit: 'synthetic-unit' },
      'synthetic-concentration': {
        value: expectedConcentration,
        unit: canonicalUnit,
      },
    },
  };
}

function positiveAndBoundaries(
  values: CommonFormulaInputs,
  expectedStatus: TestCalculationResult['status'],
  expectedValue?: number,
): Pick<FormulaContractCases, 'positive' | 'exactMinimum' | 'exactMaximum'> {
  const { id, version, baseInputs } = values;
  return {
    positive: {
      request: request(id, version, baseInputs),
      expectedStatus,
      ...(expectedValue !== undefined ? { expectedValue } : {}),
    },
    exactMinimum: {
      request: request(id, version, {
        ...baseInputs,
        'synthetic-axis': { value: 0, unit: 'synthetic-unit' },
      }),
      expectedStatus,
    },
    exactMaximum: {
      request: request(id, version, {
        ...baseInputs,
        'synthetic-axis': { value: 100, unit: 'synthetic-unit' },
      }),
      expectedStatus,
    },
  };
}

function invalidInputCases(
  values: CommonFormulaInputs,
): Pick<
  FormulaContractCases,
  'negative' | 'outOfRange' | 'missingRequired' | 'nonFinite'
> {
  const { id, version, baseInputs } = values;
  return {
    negative: {
      request: request(id, version, {
        ...baseInputs,
        'synthetic-axis': { value: -1, unit: 'synthetic-unit' },
      }),
      expectedStatus: 'invalid-input',
      inputId: 'synthetic-axis',
    },
    outOfRange: {
      request: request(id, version, {
        ...baseInputs,
        'synthetic-axis': { value: 101, unit: 'synthetic-unit' },
      }),
      expectedStatus: 'invalid-input',
      inputId: 'synthetic-axis',
    },
    missingRequired: {
      request: request(id, version, {
        'synthetic-concentration': baseInputs['synthetic-concentration'],
      }),
      expectedStatus: 'invalid-input',
      inputId: 'synthetic-axis',
    },
    nonFinite: [
      {
        label: 'NaN',
        request: request(id, version, {
          ...baseInputs,
          'synthetic-axis': { value: Number.NaN, unit: 'synthetic-unit' },
        }),
        inputId: 'synthetic-axis',
      },
      {
        label: 'infinite',
        request: request(id, version, {
          ...baseInputs,
          'synthetic-axis': {
            value: Number.POSITIVE_INFINITY,
            unit: 'synthetic-unit',
          },
        }),
        inputId: 'synthetic-axis',
      },
      {
        label: 'negative infinite',
        request: request(id, version, {
          ...baseInputs,
          'synthetic-axis': {
            value: Number.NEGATIVE_INFINITY,
            unit: 'synthetic-unit',
          },
        }),
        inputId: 'synthetic-axis',
      },
    ],
  };
}

function unitCases(
  values: CommonFormulaInputs,
  conversionStatus: TestCalculationResult['status'],
): Pick<FormulaContractCases, 'unitConversion' | 'invalidUnit'> {
  const { id, version, baseInputs } = values;
  return {
    unitConversion: {
      request: request(id, version, {
        ...baseInputs,
        'synthetic-concentration': {
          value: values.alternateValue,
          unit: values.alternateUnit,
        },
      }),
      expectedStatus: conversionStatus,
      inputId: 'synthetic-concentration',
      expectedNormalizedValue: values.expectedConcentration,
    },
    invalidUnit: {
      request: request(id, version, {
        ...baseInputs,
        'synthetic-concentration': {
          value: values.expectedConcentration,
          unit: 'unlisted-fictional-unit',
        },
      }),
      expectedStatus: 'unit-error',
      inputId: 'synthetic-concentration',
    },
  };
}

function populationCase(
  values: CommonFormulaInputs,
): Pick<FormulaContractCases, 'outOfPopulation'> {
  return {
    outOfPopulation: {
      request: request(values.id, values.version, {
        ...values.baseInputs,
        'synthetic-concentration': {
          value: 5,
          unit: values.canonicalUnit,
        },
      }),
      expectedStatus: 'out-of-population',
      guardId: 'synthetic-population-window',
    },
  };
}

function optionalInputCase(
  definition: TestFormulaDefinition,
  baseInputs: CommonFormulaInputs['baseInputs'],
  expectedStatus: TestCalculationResult['status'],
  expectedValue?: number,
): Pick<FormulaContractCases, 'optionalMissing'> | Record<string, never> {
  const optionalInput = definition.inputs.find(
    (item) => item.id === 'synthetic-optional',
  );
  return optionalInput && !optionalInput.required
    ? {
        optionalMissing: {
          request: request(
            definition.formulaId,
            definition.formulaVersion,
            baseInputs,
          ),
          expectedStatus,
          ...(expectedValue !== undefined ? { expectedValue } : {}),
          inputId: optionalInput.id,
        },
      }
    : {};
}

export function commonCases(
  definition: TestFormulaDefinition,
  options: {
    readonly expectedPositiveStatus?: TestCalculationResult['status'];
    readonly expectedPositiveValue?: number;
    readonly expectedConversionStatus?: TestCalculationResult['status'];
    readonly concentrationUnit?: 'mg/dL' | 'µmol/L';
  } = {},
): FormulaContractCases {
  const values = commonFormulaInputs(
    definition,
    options.concentrationUnit ?? 'mg/dL',
  );
  const expectedStatus = options.expectedPositiveStatus ?? 'ok';
  return {
    ...positiveAndBoundaries(
      values,
      expectedStatus,
      options.expectedPositiveValue,
    ),
    ...invalidInputCases(values),
    ...unitCases(values, options.expectedConversionStatus ?? 'ok'),
    ...populationCase(values),
    ...optionalInputCase(
      definition,
      values.baseInputs,
      expectedStatus,
      options.expectedPositiveValue,
    ),
  };
}

export const linear = makeDefinition({
  id: 'synthetic-linear',
  version: '1.0',
});

export const guarded = makeDefinition({
  id: 'synthetic-population-guard',
  version: '1.0',
  canonicalConcentrationUnit: 'µmol/L',
  compute: (values) => {
    const axis = values['synthetic-axis'];
    const concentration = values['synthetic-concentration'];
    if (axis === undefined || concentration === undefined) {
      throw new Error('Synthetic required input is missing.');
    }
    return axis + concentration / 9;
  },
});

export const optional = makeDefinition({
  id: 'synthetic-optional-input',
  version: '1.0',
  includeOptional: true,
  compute: (values) => {
    const axis = values['synthetic-axis'];
    const concentration = values['synthetic-concentration'];
    if (axis === undefined || concentration === undefined) {
      throw new Error('Synthetic required input is missing.');
    }
    const extra = values['synthetic-optional'];
    return axis + concentration / 3 + (extra === undefined ? 7 : extra);
  },
});

export const olderVersion = makeDefinition({
  id: 'synthetic-versioned',
  version: '1.0',
  deprecated: 'This fictional test version is deprecated.',
  compute: (values) => {
    const axis = values['synthetic-axis'];
    const concentration = values['synthetic-concentration'];
    if (axis === undefined || concentration === undefined) {
      throw new Error('Synthetic required input is missing.');
    }
    return axis + concentration;
  },
});

export const newerVersion = makeDefinition({
  id: 'synthetic-versioned',
  version: '2.0',
  compute: (values) => {
    const axis = values['synthetic-axis'];
    const concentration = values['synthetic-concentration'];
    if (axis === undefined || concentration === undefined) {
      throw new Error('Synthetic required input is missing.');
    }
    return axis + concentration / 2;
  },
});

export const throwing = makeDefinition({
  id: 'synthetic-throwing',
  version: '1.0',
  compute: () => {
    throw new Error('synthetic compute failure with private input');
  },
});

function withConcentrationRanges(
  definition: TestFormulaDefinition,
  ranges: Readonly<
    Record<string, { readonly min: number; readonly max: number }>
  >,
): TestFormulaDefinition {
  return {
    ...definition,
    inputs: definition.inputs.map((item) =>
      item.id === 'synthetic-concentration'
        ? { ...item, plausibleRangeByUnit: ranges }
        : item,
    ),
  };
}

function withFormulaId(
  definition: TestFormulaDefinition,
  formulaId: string,
): TestFormulaDefinition {
  return { ...definition, formulaId };
}

export const divergentNarrow = withFormulaId(
  withConcentrationRanges(linear, {
    'mg/dL': { min: 0, max: 100 },
    'µmol/L': { min: 0, max: 2000 },
  }),
  'synthetic-divergent-narrow',
);

export const divergentWide = withFormulaId(
  withConcentrationRanges(linear, {
    'mg/dL': { min: 0, max: 20000 },
    'µmol/L': { min: 0, max: 2000 },
  }),
  'synthetic-divergent-wide',
);

function withExtraGuard(
  definition: TestFormulaDefinition,
  guard: TestFormulaDefinition['populationLimits']['guards'][number],
): TestFormulaDefinition {
  return {
    ...definition,
    populationLimits: {
      text: definition.populationLimits.text,
      guards: [...definition.populationLimits.guards, guard],
    },
  };
}

export const atLeastGuarded = withFormulaId(
  withExtraGuard(linear, {
    id: 'synthetic-at-least-floor',
    inputId: 'synthetic-concentration',
    operator: 'at-least',
    value: 18,
    unit: 'mg/dL',
    message: 'Fictional test floor only.',
  }),
  'synthetic-at-least-guard',
);

export const atMostGuarded = withFormulaId(
  withExtraGuard(linear, {
    id: 'synthetic-at-most-ceiling',
    inputId: 'synthetic-concentration',
    operator: 'at-most',
    value: 150,
    unit: 'mg/dL',
    message: 'Fictional test ceiling only.',
  }),
  'synthetic-at-most-guard',
);
