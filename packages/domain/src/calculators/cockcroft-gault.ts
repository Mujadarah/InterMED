import { STANDARD_UNIT_CONVERSIONS } from './units';
import { freezeDefinition } from './registry';
import { getFormulaVersionId } from './types';
import type {
  FormulaComponentVersions,
  FormulaDefinition,
  FormulaUnitConversions,
} from './types';

const massConversions = STANDARD_UNIT_CONVERSIONS.mass;
if (!massConversions) {
  throw new Error('Standard mass conversion table is required.');
}

const COCKCROFT_GAULT_COMPONENT_VERSIONS: FormulaComponentVersions =
  Object.freeze({
    formula: '1.1.0',
    population: '1.0.0',
    presentation: '1.1.0',
  });

const COCKCROFT_GAULT_CONVERSIONS: FormulaUnitConversions = Object.freeze({
  mass: massConversions,
  'serum-creatinine': Object.freeze([
    Object.freeze({
      fromUnit: 'mg/dL',
      toUnit: 'µmol/L',
      factor: 88.4,
    }),
    Object.freeze({
      fromUnit: 'µmol/L',
      toUnit: 'mg/dL',
      factor: 1 / 88.4,
    }),
  ]),
});

const ADULT_POPULATION = Object.freeze({
  text: 'Adult-only release scope: ages 18 years and older. Cockcroft-Gault validation below 18 years is not implemented. Ages above 92 are outside the derivation cohort.',
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
    Object.freeze({
      id: 'age-below-140',
      inputId: 'age',
      operator: 'at-most' as const,
      value: 139,
      unit: 'years',
      message:
        'The equation arithmetic gives zero or a negative value at age 140 or above, which is not a valid result; this is a technical guard, not a physiological cutoff.',
    }),
  ]),
});

function computeCockcroftGault(
  values: Readonly<Record<string, number | undefined>>,
  categories?: Readonly<Record<string, string | undefined>>,
): number {
  const age = values['age'];
  const weightKg = values['weight'];
  const creatinineMgPerDl = values['creatinine'];
  const sex = categories?.['sex'];
  if (
    age === undefined ||
    weightKg === undefined ||
    creatinineMgPerDl === undefined ||
    (sex !== 'female' && sex !== 'male')
  ) {
    return Number.NaN;
  }
  const clearance = ((140 - age) * weightKg) / (72 * creatinineMgPerDl);
  return sex === 'female' ? clearance * 0.85 : clearance;
}

export const COCKCROFT_GAULT_FORMULA: FormulaDefinition = freezeDefinition({
  formulaId: 'crcl-cockcroft-gault',
  formulaVersion: getFormulaVersionId(COCKCROFT_GAULT_COMPONENT_VERSIONS),
  componentVersions: COCKCROFT_GAULT_COMPONENT_VERSIONS,
  title: 'Creatinine clearance Cockcroft-Gault (adult candidate)',
  primaryReference: {
    citation:
      'Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron. 1976;16:31-41.',
    urlOrDoi: 'https://doi.org/10.1159/000180580',
  },
  inputs: [
    {
      id: 'age',
      label: 'Age',
      quantityKind: 'age',
      canonicalUnit: 'years',
      allowedUnits: ['years'],
      plausibleRangeByUnit: { years: { min: 0, max: 130 } },
      required: true,
    },
    {
      id: 'weight',
      label: 'Body weight entered (kg or lb)',
      quantityKind: 'mass',
      canonicalUnit: 'kg',
      allowedUnits: ['kg', 'lb'],
      plausibleRangeByUnit: {
        kg: { min: 1, max: 500 },
        lb: {
          min: 2.2046226218487757,
          max: 500 * 2.2046226218487757,
        },
      },
      required: true,
    },
    {
      kind: 'category',
      id: 'weightConvention',
      label: 'Which body weight was entered',
      required: true,
      options: [
        { id: 'actual', label: 'Actual body weight' },
        { id: 'ideal', label: 'Ideal body weight' },
        { id: 'adjusted', label: 'Adjusted body weight' },
      ],
    },
    {
      id: 'creatinine',
      label: 'Serum creatinine',
      quantityKind: 'serum-creatinine',
      canonicalUnit: 'mg/dL',
      allowedUnits: ['mg/dL', 'µmol/L'],
      plausibleRangeByUnit: {
        'mg/dL': { min: 0.1, max: 20 },
        'µmol/L': { min: 8.84, max: 1768 },
      },
      required: true,
    },
    {
      kind: 'category',
      id: 'sex',
      label: 'Sex used by the equation (female × 0.85 adjustment)',
      required: true,
      options: [
        { id: 'female', label: 'Female' },
        { id: 'male', label: 'Male' },
      ],
    },
  ],
  unitConversions: COCKCROFT_GAULT_CONVERSIONS,
  output: {
    unit: 'mL/min',
    rounding: { mode: 'half-up-decimal', precision: 0 },
  },
  populationLimits: ADULT_POPULATION,
  limitations: [
    'Unindexed creatinine clearance, not eGFR, and not interchangeable with CKD-EPI or measured GFR.',
    'Derived in 249 men aged 18-92; the female × 0.85 factor was estimated and was not independently validated in the original derivation population.',
    'Ages above 92 are outside the derivation cohort (an applicability flag, not a physiological cutoff).',
    'The equation uses the body weight number entered; select which body weight was entered (actual, ideal, or adjusted). InterMED does not convert between weight conventions and no ideal or adjusted body-weight equation is implemented.',
    'The original equation predates IDMS creatinine standardization; results with modern standardized assays may differ from historical pharmacokinetic estimates. InterMED has not clinically validated modern-assay compatibility.',
    'Not for unstable function or AKI, pregnancy, critical illness, muscle-mass extremes, amputation, children or dialysis.',
    'Not validated specifically for the Romanian population; no population-specific precision is claimed.',
    "Not InterMED's default medication-dosing method; no drug dosing is provided.",
    'Do not round a low serum creatinine up to 1.0.',
    'Displayed as a whole number; the unrounded value is kept internally and is never used for later calculations or threshold decisions.',
    'Technical bounds, not clinically validated plausibility thresholds: weight 1-500 kg, creatinine 0.1-20 mg/dL (8.84-1768 µmol/L), age 0-130 years. Values outside these technical bounds return invalid-input.',
  ],
  reviewStatus: 'unreviewed',
  compute: computeCockcroftGault,
});
