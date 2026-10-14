import { STANDARD_UNIT_CONVERSIONS } from './units';
import { freezeDefinition } from './registry';
import { getFormulaVersionId } from './types';
import type {
  FormulaClassification,
  FormulaComponentVersions,
  FormulaDefinition,
  FormulaInputDefinition,
  FormulaSoftCheck,
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

// The technical minimum lets under-18 ages reach the adult release-scope guard.
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
    return {
      code: 'who-international-adult-underweight',
      label:
        'WHO international adult classification, WHO Technical Report Series 894 (2000): Underweight',
    };
  }
  if (bmi < 25) {
    return {
      code: 'who-international-adult-normal',
      label:
        'WHO international adult classification, WHO Technical Report Series 894 (2000): Normal range',
    };
  }
  if (bmi < 30) {
    return {
      code: 'who-international-adult-pre-obese',
      label:
        'WHO international adult classification, WHO Technical Report Series 894 (2000): Pre-obese (overweight)',
    };
  }
  if (bmi < 35) {
    return {
      code: 'who-international-adult-obese-class-i',
      label:
        'WHO international adult classification, WHO Technical Report Series 894 (2000): Obese class I',
    };
  }
  if (bmi < 40) {
    return {
      code: 'who-international-adult-obese-class-ii',
      label:
        'WHO international adult classification, WHO Technical Report Series 894 (2000): Obese class II',
    };
  }
  return {
    code: 'who-international-adult-obese-class-iii',
    label:
      'WHO international adult classification, WHO Technical Report Series 894 (2000): Obese class III',
  };
}

const ADULT_POPULATION = Object.freeze({
  text: 'Adult-only release scope: ages 18 years and older. BMI-for-age classification for adolescents up to 19 years is not implemented.',
  guards: Object.freeze([
    Object.freeze({
      id: 'adult-age',
      inputId: 'age',
      operator: 'at-least' as const,
      value: 18,
      unit: 'years',
      message:
        'This release limits this calculator to adults aged 18 years or older; this is a product scope decision, not a statement that the formula is invalid at younger ages.',
    }),
  ]),
});

const ENGINEERING_LIMITATION =
  'Technical bounds, not clinically validated plausibility thresholds: weight 1-500 kg, height 50-272 cm, age 0-130 years. Values outside these technical bounds return invalid-input.';

const PROPOSED_SOFT_CHECKS: readonly FormulaSoftCheck[] = Object.freeze([
  Object.freeze({
    id: 'weight-unusual',
    kind: 'input-range',
    inputId: 'weight',
    minimum: 30,
    maximum: 250,
    unit: 'kg',
    message:
      'Confirm the entered weight; it is outside the 30–250 kg check range.',
  }),
  Object.freeze({
    id: 'height-unusual',
    kind: 'input-range',
    inputId: 'height',
    minimum: 130,
    maximum: 220,
    unit: 'cm',
    message:
      'Confirm the entered height; it is outside the 130–220 cm check range.',
  }),
  Object.freeze({
    id: 'age-over-110',
    kind: 'input-range',
    inputId: 'age',
    maximum: 110,
    unit: 'years',
    message: 'Confirm the entered age; it is above the 110-year check point.',
  }),
  Object.freeze({
    id: 'implied-bmi-outside-range',
    kind: 'implied-bmi-range',
    weightInputId: 'weight',
    heightInputId: 'height',
    minimum: 12,
    maximum: 70,
    message:
      'Confirm the entered weight and height; their implied BMI is outside the 12–70 check range.',
  }),
]);

const SOFT_CHECK_LIMITATION =
  'Confirmation is required for: weight below 30 kg or above 250 kg; height below 130 cm or above 220 cm; age above 110 years; implied BMI below 12 or above 70 kg/m².';

const BMI_COMPONENT_VERSIONS: FormulaComponentVersions = Object.freeze({
  formula: '1.0.0',
  population: '2.1.0',
  classification: '2.0.0',
  presentation: '2.0.1',
  confirmation: '1.0.1',
});

const BSA_COMPONENT_VERSIONS: FormulaComponentVersions = Object.freeze({
  formula: '1.0.0',
  population: '2.1.0',
  presentation: '2.0.1',
  confirmation: '1.0.1',
});

const WHO_ADULT_BMI_CITATION =
  'WHO. Obesity: Preventing and Managing the Global Epidemic. WHO Technical Report Series 894 (2000).';

export const BMI_FORMULA: FormulaDefinition = freezeDefinition({
  formulaId: 'bmi',
  formulaVersion: getFormulaVersionId(BMI_COMPONENT_VERSIONS),
  componentVersions: BMI_COMPONENT_VERSIONS,
  title: 'Body mass index (adult candidate)',
  primaryReference: {
    citation:
      'BMI formula: Keys A, Fidanza F, Karvonen MJ, Kimura N, Taylor HL. Indices of relative weight and obesity. J Chronic Dis. 1972;25:329–343. Historical attribution: Quetelet A (1835). Adult classification: ' +
      WHO_ADULT_BMI_CITATION,
    urlOrDoi: 'https://iris.who.int/handle/10665/42330',
  },
  inputs: [weightInput(), heightInput('m'), ageInput()],
  unitConversions: FORMULA_UNIT_CONVERSIONS,
  output: {
    unit: 'kg/m²',
    rounding: { mode: 'half-up-decimal', precision: 1 },
  },
  populationLimits: ADULT_POPULATION,
  limitations: [
    'WHO international adult classification uses thresholds from WHO Technical Report Series 894 (2000) and applies categories to the unrounded BMI value.',
    'Adults only: this release accepts ages 18 years and older and does not implement pediatric BMI classification. WHO BMI-for-age references include adolescents up to 19 years; future population-specific assessment requires separate evidence and review.',
    'Cardiometabolic risk may occur at lower BMI values in certain populations. This international adult classification does not implement population-specific thresholds or assessment; population-specific assessment may be added separately in a future version after separate evidence and review.',
    'BMI is a screening index, not a direct body-fat measure and not a diagnosis.',
    'Interpretation may be affected by muscle mass, pregnancy, amputation, edema (oedema), and body-composition extremes.',
    'No ethnicity-specific thresholds, dose, diagnosis, or treatment advice are provided.',
    SOFT_CHECK_LIMITATION,
    ENGINEERING_LIMITATION,
    'Original-paper rounding and instrument-specific reuse rights have not been verified.',
  ],
  softChecks: PROPOSED_SOFT_CHECKS,
  reviewStatus: 'unreviewed',
  compute: (values) => {
    const weightKg = values['weight'];
    const heightM = values['height'];
    if (weightKg === undefined || heightM === undefined) return Number.NaN;
    return weightKg / (heightM * heightM);
  },
  classify: classifyBmi,
});

export const MOSTELLER_BSA_FORMULA: FormulaDefinition = freezeDefinition({
  formulaId: 'bsa-mosteller',
  formulaVersion: getFormulaVersionId(BSA_COMPONENT_VERSIONS),
  componentVersions: BSA_COMPONENT_VERSIONS,
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
    rounding: { mode: 'half-up-decimal', precision: 2 },
  },
  populationLimits: ADULT_POPULATION,
  limitations: [
    'Mosteller BSA is an estimate; no dosing advice is provided.',
    'It differs from Du Bois; no superiority claim or automatic substitution is made.',
    "Applicability has not been validated beyond the source populations. Use outside this release's adult scope has not been reviewed; this does not mean the Mosteller formula is inherently invalid for children.",
    'This is a display-only estimate; the displayed rounded value is not to be used as an implicit input for medication-dose calculations.',
    SOFT_CHECK_LIMITATION,
    ENGINEERING_LIMITATION,
    'Original derivation and instrument-specific reuse rights have not been verified.',
  ],
  softChecks: PROPOSED_SOFT_CHECKS,
  reviewStatus: 'unreviewed',
  compute: (values) => {
    const weightKg = values['weight'];
    const heightCm = values['height'];
    if (weightKg === undefined || heightCm === undefined) return Number.NaN;
    return Math.sqrt((heightCm * weightKg) / 3600);
  },
});
