import { freezeDefinition } from './registry';
import { getFormulaVersionId } from './types';
import type {
  FormulaComponentVersions,
  FormulaDefinition,
  FormulaUnitConversions,
} from './types';

const CKD_EPI_COMPONENT_VERSIONS: FormulaComponentVersions = Object.freeze({
  formula: '1.0.0',
  population: '1.0.0',
  presentation: '1.0.0',
});

const CREATININE_CONVERSIONS: FormulaUnitConversions = Object.freeze({
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
  text: 'Adult-only release scope: ages 18 years and older. CKD-EPI 2021 creatinine validation below 18 years is not implemented.',
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

function computeCkdEpi2021(
  values: Readonly<Record<string, number | undefined>>,
  categories?: Readonly<Record<string, string | undefined>>,
): number {
  const creatinineMgPerDl = values['creatinine'];
  const age = values['age'];
  const sex = categories?.['sex'];
  if (
    creatinineMgPerDl === undefined ||
    age === undefined ||
    (sex !== 'female' && sex !== 'male')
  ) {
    return Number.NaN;
  }
  const kappa = sex === 'female' ? 0.7 : 0.9;
  const alpha = sex === 'female' ? -0.241 : -0.302;
  const ratio = creatinineMgPerDl / kappa;
  return (
    142 *
    Math.pow(Math.min(ratio, 1), alpha) *
    Math.pow(Math.max(ratio, 1), -1.2) *
    Math.pow(0.9938, age) *
    (sex === 'female' ? 1.012 : 1)
  );
}

export const CKD_EPI_2021_CREATININE_FORMULA: FormulaDefinition =
  freezeDefinition({
    formulaId: 'egfr-ckd-epi-2021-cr',
    formulaVersion: getFormulaVersionId(CKD_EPI_COMPONENT_VERSIONS),
    componentVersions: CKD_EPI_COMPONENT_VERSIONS,
    title: 'eGFR CKD-EPI 2021 creatinine (adult candidate)',
    primaryReference: {
      citation:
        'Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med. 2021;385:1737-1749. Table 2 new creatinine age-sex equation; coefficients confirmed by NIDDK.',
      urlOrDoi: 'https://doi.org/10.1056/NEJMoa2102953',
    },
    inputs: [
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
        id: 'age',
        label: 'Age',
        quantityKind: 'age',
        canonicalUnit: 'years',
        allowedUnits: ['years'],
        plausibleRangeByUnit: { years: { min: 0, max: 130 } },
        required: true,
      },
      {
        kind: 'category',
        id: 'sex',
        label: 'Sex used by the equation (female/male coefficients)',
        required: true,
        options: [
          { id: 'female', label: 'Female' },
          { id: 'male', label: 'Male' },
        ],
      },
    ],
    unitConversions: CREATININE_CONVERSIONS,
    output: {
      unit: 'mL/min/1.73 m²',
      rounding: { mode: 'half-up-decimal', precision: 0 },
    },
    populationLimits: ADULT_POPULATION,
    limitations: [
      'Candidate equation for stable adult kidney function only; proposed, pending owner sign-off.',
      'Not for acute kidney injury, dialysis or pregnancy.',
      'Unreliable with extremes of muscle mass, amputation, malnutrition or obesity.',
      'Requires an IDMS-traceable creatinine assay.',
      'The cystatin C equations are separate and not implemented.',
      'This is not Cockcroft-Gault and not for dosing; de-indexing by BSA does not authorise dosing.',
      'No CKD diagnosis or staging from a single value; no KDIGO G-stages are implemented.',
      'Romanian population suitability and the sex-coefficient selection need clinical review; proposed, pending owner sign-off.',
      'Display precision (integer) is proposed, pending owner sign-off.',
      'Technical bounds, not clinically validated plausibility thresholds: creatinine 0.1-20 mg/dL (8.84-1768 µmol/L), age 0-130 years. Values outside these technical bounds return invalid-input.',
    ],
    reviewStatus: 'unreviewed',
    compute: computeCkdEpi2021,
  });
