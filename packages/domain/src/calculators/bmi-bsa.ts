import { STANDARD_UNIT_CONVERSIONS } from './units';
import type {
  FormulaClassification,
  FormulaDefinition,
  FormulaInputDefinition,
  FormulaUnitConversions,
} from './types';

const massConversions = STANDARD_UNIT_CONVERSIONS.mass;
const lengthConversions = STANDARD_UNIT_CONVERSIONS.length;
if (!massConversions || !lengthConversions) {
  throw new Error('Standard mass and length conversion tables are required.');
}

const FORMULA_UNIT_CONVERSIONS: FormulaUnitConversions = Object.freeze({
  mass: massConversions,
  length: lengthConversions,
});

const WEIGHT_RANGES: FormulaInputDefinition['plausibleRangeByUnit'] =
  Object.freeze({
    kg: Object.freeze({ min: 1, max: 500 }),
    lb: Object.freeze({
      min: 2.2046226218487757,
      max: 500 * 2.2046226218487757,
    }),
  });

const HEIGHT_RANGES: FormulaInputDefinition['plausibleRangeByUnit'] =
  Object.freeze({
    cm: Object.freeze({ min: 50, max: 272 }),
    m: Object.freeze({ min: 0.5, max: 2.72 }),
    in: Object.freeze({ min: 50 / 2.54, max: 272 / 2.54 }),
  });

// Allow subadult ages through value validation so the population guard can
// return the structured out-of-population result.
const AGE_RANGE: FormulaInputDefinition['plausibleRangeByUnit'] = Object.freeze(
  { years: Object.freeze({ min: 0, max: 130 }) },
);

function weightInput(): FormulaInputDefinition {
  return {
    id: 'weight',
    label: 'Weight',
    quantityKind: 'mass',
    canonicalUnit: 'kg',
    allowedUnits: ['kg', 'lb'],
    plausibleRangeByUnit: WEIGHT_RANGES,
    required: true,
  };
}

function heightInput(canonicalUnit: 'm' | 'cm'): FormulaInputDefinition {
  return {
    id: 'height',
    label: 'Height',
    quantityKind: 'length',
    canonicalUnit,
    allowedUnits: ['cm', 'm', 'in'],
    plausibleRangeByUnit: HEIGHT_RANGES,
    required: true,
  };
}

function ageInput(): FormulaInputDefinition {
  return {
    id: 'age',
    label: 'Age',
    quantityKind: 'age',
    canonicalUnit: 'years',
    allowedUnits: ['years'],
    plausibleRangeByUnit: AGE_RANGE,
    required: true,
  };
}

function classifyBmi(bmi: number): FormulaClassification {
  if (bmi < 18.5) {
    return { code: 'underweight', label: 'Underweight' };
  }
  if (bmi < 25) {
    return { code: 'normal', label: 'Normal range' };
  }
  if (bmi < 30) {
    return { code: 'pre-obese', label: 'Pre-obese (overweight)' };
  }
  if (bmi < 35) {
    return { code: 'obese-class-i', label: 'Obese class I' };
  }
  if (bmi < 40) {
    return { code: 'obese-class-ii', label: 'Obese class II' };
  }
  return { code: 'obese-class-iii', label: 'Obese class III' };
}

const ADULT_POPULATION = Object.freeze({
  text: 'Adult-only scope: age at least 18 years. No pediatric calculation.',
  guards: Object.freeze([
    Object.freeze({
      id: 'adult-age',
      inputId: 'age',
      operator: 'at-least' as const,
      value: 18,
      unit: 'years',
      message:
        'This formula is specified only for adults aged 18 years or older.',
    }),
  ]),
});

const ENGINEERING_LIMITATION =
  'Engineering plausibility limits, pending owner review: weight 1–500 kg, height 50–272 cm, and adult age 18–130 years. Values outside these limits are not calculated.';

export const BMI_FORMULA: FormulaDefinition = {
  formulaId: 'bmi',
  formulaVersion: '1.0.0',
  title: 'Body mass index (adult candidate)',
  primaryReference: {
    citation:
      'Keys A, Fidanza F, Karvonen MJ, Kimura N, Taylor HL. Indices of relative weight and obesity. J Chronic Dis. 1972;25:329–343. Historical attribution: Quetelet A (1835).',
    urlOrDoi: 'https://doi.org/10.1016/0021-9681(72)90027-6',
  },
  inputs: [weightInput(), heightInput('m'), ageInput()],
  unitConversions: FORMULA_UNIT_CONVERSIONS,
  output: {
    unit: 'kg/m²',
    rounding: { mode: 'half-away-from-zero', precision: 1 },
  },
  populationLimits: ADULT_POPULATION,
  limitations: [
    'Candidate WHO adult BMI categories (WHO Technical Report Series 894, 2000) are included for engineering review only; their thresholds and application to ages 18–19 are pending owner clinical approval.',
    'For adults only; values below age 18 return an out-of-population result.',
    'BMI is a screening index, not a direct body-fat measure and not a diagnosis.',
    'Interpretation may be affected by muscle mass, pregnancy, amputation, edema (oedema), and body-composition extremes.',
    'No ethnicity-specific thresholds, dose, diagnosis, or treatment advice are provided.',
    ENGINEERING_LIMITATION,
    'Original-paper rounding and instrument-specific reuse rights have not been verified.',
  ],
  reviewStatus: 'unreviewed',
  compute: (values) => {
    const weightKg = values['weight'];
    const heightM = values['height'];
    if (weightKg === undefined || heightM === undefined) return Number.NaN;
    return weightKg / (heightM * heightM);
  },
  classify: classifyBmi,
};

export const MOSTELLER_BSA_FORMULA: FormulaDefinition = {
  formulaId: 'bsa-mosteller',
  formulaVersion: '1.0.0',
  title: 'Body surface area (Mosteller adult estimate)',
  primaryReference: {
    citation:
      'Mosteller RD. Simplified calculation of body-surface area. N Engl J Med. 1987;317:1098.',
    urlOrDoi: 'https://doi.org/10.1056/NEJM198710223171717',
  },
  inputs: [weightInput(), heightInput('cm'), ageInput()],
  unitConversions: FORMULA_UNIT_CONVERSIONS,
  output: {
    unit: 'm²',
    rounding: { mode: 'half-away-from-zero', precision: 2 },
  },
  populationLimits: ADULT_POPULATION,
  limitations: [
    'Mosteller BSA is an estimate; no dosing advice is provided.',
    'It differs from Du Bois; no superiority claim or automatic substitution is made.',
    'Applicability has not been validated beyond the source populations; obesity, pregnancy, amputation, edema (oedema), and pediatrics require review.',
    ENGINEERING_LIMITATION,
    'Original derivation and instrument-specific reuse rights have not been verified.',
  ],
  reviewStatus: 'unreviewed',
  compute: (values) => {
    const weightKg = values['weight'];
    const heightCm = values['height'];
    if (weightKg === undefined || heightCm === undefined) return Number.NaN;
    return Math.sqrt((heightCm * weightKg) / 3600);
  },
};
