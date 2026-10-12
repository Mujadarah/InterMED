# Calculator source assessment — Milestone 11 research

Assessment date: 2026-10-12. Scope: candidates in [PRODUCT_SPEC](../plan/PRODUCT_SPEC.md), [M11](../plan/CODEX_BUILD_PLAN.md#milestone-11--clinical-calculators), [TESTING](../plan/TESTING.md#calculators-milestone-11) and [CLINICAL_SAFETY](../plan/CLINICAL_SAFETY.md#calculator-safety).

**Research only: not formula approval, clinical review, M11 acceptance or authorization for clinical release.** No code, patient data or live Appwrite changes. Every candidate remains rights-review-pending and clinical-review-pending. Recommendations are proposals for a named reviewer; inputs must remain manually entered and ephemeral, without profiles, auto-population or telemetry.

## Method and evidence labels

Two free CLI workers were assigned BMI/BSA/renal/electrolytes and thrombosis/sepsis/liver respectively, with raw findings restricted to temporary storage. The lead independently reconciled citations, equations and units against primary publications/abstracts and institutional sources. The first worker produced a raw findings file despite a nonzero exit status and search failures; the second stalled without findings and was stopped. The lead completed the remaining research. Worker reports are not source authority.

**Primary checked** means the relevant primary equation, table or abstract was accessible, including indexed abstracts where stated. **Institutional cross-check** means an official source supplies the equation but does not close an inaccessible original-paper check. **Unverified** details remain implementation blockers. **Derived fixtures** below use synthetic inputs and recalculated arithmetic; they are not published patients or clinically validated test cases. Bibliographic verification does not imply full-text verification. Sources were checked on the assessment date.

## Units, precision and shared review rules

| Quantity      | Conventional to SI                                   | Source/convention                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Creatinine    | mg/dL × 88.4 = µmol/L                                | [NIDDK adult equations](https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults), conversion factors |
| Albumin       | g/dL × 10 = g/L                                      | Dimensional equivalence; [McDonald et al. primary study](https://pubmed.ncbi.nlm.nih.gov/31958813/), SI note                                                                                           |
| Bilirubin     | mg/dL × 17.1 = µmol/L                                | Same primary study, SI note                                                                                                                                                                            |
| Total calcium | mg/dL × 0.25 ≈ mmol/L                                | Rounded clinical factor, [Moreno Llorente et al., laboratory methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC6802248/); exact molecular-weight conversion differs slightly                           |
| Glucose       | mg/dL ÷ 18 ≈ mmol/L                                  | Rounded convention; compare [European hyponatraemia guideline §6.1.2](https://doi.org/10.1530/EJE-13-1020), which uses rounded SI baseline/increment 5.5                                               |
| Sodium        | mEq/L = mmol/L numerically                           | Monovalent ion; [Hillier](https://pubmed.ncbi.nlm.nih.gov/10225241/) and [Kim](https://doi.org/10.1053/j.gastro.2021.08.050) use these units                                                           |
| Height/weight | cm ÷ 100 = m; inch × 2.54 = cm; lb × 0.45359237 = kg | [NIST SP 811 Appendix B](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors); propose metric-only v1                                                         |
| Pressure      | kPa × 7.50062 ≈ mmHg                                 | NIST; FiO2 must be a fraction in PaO2/FiO2                                                                                                                                                             |
| Platelets     | 10³/µL = 10⁹/L numerically                           | Dimensional equivalence; distinguish from unscaled cells/µL                                                                                                                                            |

Inverse conversions divide by the same factor. Preserve original units, convert once and calculate without intermediate display rounding. Rounded SI thresholds in score tables may not exactly equal conventional thresholds; a reviewer must choose the authoritative system. Never silently normalize missing inputs to zero/normal.

**Proposed display policy, not a publication mandate:** BMI 1 decimal; BSA 2 decimals; renal estimates nearest integer with units; calcium 2 decimals in mmol/L or 1 in mg/dL; sodium 1 decimal. Discrete sums retain exact integer/half-point values. Classify on unrounded values. MELD has its own published rounding sequence. Exactly x.5 tie-breaking requires an explicit reviewed rule; “nearest integer” alone does not select a programming-language convention.

Propose adult-only initial scope, with calculator-specific review of pregnancy, dialysis, unstable renal function, amputation, obesity/body-composition extremes and pediatrics. These are not universal exclusions for every score. Unestablished applicability remains visible and blocks clinical interpretation. No automatic dose, diagnosis or management decision follows from any number.

## 1. BMI

**Primary reference:** Keys A, Fidanza F, Karvonen MJ, Kimura N, Taylor HL. Indices of relative weight and obesity. _J Chronic Dis._ 1972;25:329–343. [DOI 10.1016/0021-9681(72)90027-6](<https://doi.org/10.1016/0021-9681(72)90027-6>). Primary methodological study of the index, not a claim that Keys invented it; indexed abstract checked, full historical text not fully checked.

```text
BMI [kg/m²] = weight [kg] / height [m]²
```

Institutional cross-check: [CDC adult categories](https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html). CDC categories start at age 20: <18.5, 18.5–<25, 25–<30, ≥30. Child/teen interpretation uses age/sex percentiles. Recommend numeric-only adult BMI initially; ages 18–19 and any classifications need an explicit interpretation source. BMI is a screening measure, not a direct adiposity measurement/diagnosis (CDC). Pregnancy, edema/ascites, amputation and muscular/frail builds need reviewed interpretation; no adjustment coefficients are supplied.

**Examples/tests:** derived 70 kg/1.75 m → 22.8571428571, proposed display 22.9. CDC publishes a 5 ft 9 in adult weight/category table, a rounded categorical example rather than a precise numerical oracle. Test missing/zero/negative inputs, cm mistakenly entered as m and unit equivalence. Derived 100 kg/2 m → exactly 25 tests a classification boundary before rounding. Test either side of every selected cutoff. Original-paper rounding and instrument-specific reuse permission were not verified; do not copy paper prose/charts.

## 2. BSA — Mosteller versus Du Bois

**Primary references:** Mosteller RD. Simplified calculation of body-surface area. _N Engl J Med._ 1987;317:1098. [DOI 10.1056/NEJM198710223171717](https://doi.org/10.1056/NEJM198710223171717). Du Bois D, Du Bois EF. Clinical calorimetry: tenth paper. A formula to estimate the approximate surface area if height and weight be known. _Arch Intern Med._ 1916;17:863–871. [DOI 10.1001/archinte.1916.00080130010002](https://doi.org/10.1001/archinte.1916.00080130010002).

```text
Mosteller BSA [m²] = sqrt(height [cm] × weight [kg] / 3600)
Du Bois BSA [m²] = 0.007184 × weight [kg]^0.425 × height [cm]^0.725
Historical Du Bois cm² form uses 71.84 instead of 0.007184.
```

Citations checked; original full derivations remain unverified. Mosteller coefficient/units are independently printed in an [FDA-hosted caspofungin label, BSA calculation](https://www.accessdata.fda.gov/drugsatfda_docs/nda/2008/021814s005%2C%2022-292s000lbl.pdf). Du Bois is cross-checked against the [manufacturer's formula citing the original](https://www.okayama-taiho.co.jp/medical/brand/s1t/keisan/); original-page verification remains open.

**Preference:** propose Mosteller for its simple metric expression, an engineering choice rather than proof of clinical superiority. Keep Du Bois separately versioned; no silent substitution, BSA cap or dosing inference. Proposed adult estimate only; obesity, amputation, pregnancy, edema/ascites and pediatrics need separate validation. No original published worked example or mandatory rounding rule verified.

**Derived fixtures:** 175 cm/70 kg → Mosteller 1.84466196843 m²; Du Bois 1.84814301812 m². Mosteller 180 cm/80 kg → exactly 2 m². Test missing/zero/negative height/weight, unit mismatch, extreme positive inputs, overflow and formula identity. Rights to original letters/reprints unverified; age alone is not recorded distribution permission.

## 3. Cockcroft–Gault CrCl

**Primary checked:** Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. _Nephron._ 1976;16:31–41. [DOI 10.1159/000180580](https://doi.org/10.1159/000180580), [abstract](https://pubmed.ncbi.nlm.nih.gov/1244564/), [original scan p.31](https://www.drugtnt.com/ref/RenalDosing/Cockcroft_1976.pdf). It is not a _Kidney International_ publication.

```text
CrCl [mL/min] = (140 − age [years]) × weight [kg] / (72 × Scr [mg/dL])
Multiply by 0.85 for the paper's female adjustment (15% lower).
```

Derivation used 249 men aged 18–92; female adjustment was not a separately derived female regression. Output is unindexed CrCl, not eGFR. SI implementation substitutes `Scr[µmol/L]/88.4`; `88.4/72` and `0.85×88.4/72` are derived conversion coefficients.

**Preference/limits:** conditional inclusion when reviewed use calls for CrCl. Actual versus ideal/adjusted weight in obesity and original assay-era compatibility with IDMS creatinine require review. Do not invent a weight equation or round low Scr to 1.0. [NIDDK physiological limitations](https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/factors-affecting-egfr-accuracy/clinical-measurements) cover unstable function/AKI, pregnancy, critical illness, muscle-mass extremes and amputation. Proposed scope excludes children/dialysis and does not supply drug dosing. Age beyond the derivation cohort is an applicability flag, not an invented physiological cutoff.

**Derived fixtures:** age 60/72 kg/Scr 1 mg/dL → 80 mL/min male, 68 female; 88.4 µmol/L must match. Test denominator ≤0/missing, age under 18, age 92/93, age 140+ (zero/negative arithmetic is not validity), missing sex coefficient and unspecified weight convention. No original published worked example/rounding rule verified. Publisher-expression rights unresolved.

## 4. eGFR — CKD-EPI 2021 race-free creatinine

**Primary checked:** Inker LA et al. New creatinine- and cystatin C–based equations to estimate GFR without race. _N Engl J Med._ 2021;385:1737–1749. [DOI 10.1056/NEJMoa2102953](https://doi.org/10.1056/NEJMoa2102953), Table 2 new creatinine AS equation; [NIDDK adult equations](https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults) independently confirms coefficients/units.

```text
eGFR [mL/min/1.73 m²] = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.200
                       × 0.9938^age × (1.012 if female, otherwise 1)
Scr = IDMS-traceable mg/dL; age = years, ≥18
Female: κ=0.7, α=−0.241; male: κ=0.9, α=−0.302
```

**Preference:** explicitly named 2021 race-free creatinine over MDRD for a first renal registry. Removing a race multiplier from an older equation does not produce this equation. The 2021 creatinine–cystatin C version is separate; NIDDK prefers combined markers when available, especially near decision thresholds. It needs another assay/input and independent approval.

**Comparator:** Levey AS et al. Using standardized serum creatinine values in the modification of diet in renal disease study equation for estimating glomerular filtration rate. _Ann Intern Med._ 2006;145:247–254. [DOI 10.7326/0003-4819-145-4-200608150-00004](https://doi.org/10.7326/0003-4819-145-4-200608150-00004). Historical IDMS four-variable MDRD: `175 × Scr^−1.154 × age^−0.203 × 0.742(if female) × 1.212(if Black)` in mg/dL/years, output mL/min/1.73 m², checked against [NIDDK previous equations](https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults/previous). Older nonstandardized 186-form, six-variable MDRD and CKD-EPI 2009 are distinct, not fallbacks. Original 2006 full-text/errata review remains open.

**Limits:** stable adult kidney function; no pediatric/dialysis-adequacy extrapolation. Pregnancy, AKI, amputation, obesity/extreme muscle mass and malnutrition require reviewed exception handling (NIDDK limitations above). Derived de-indexing `eGFR×BSA/1.73` yields mL/min but does not produce Cockcroft–Gault or authorize dosing. No single-result CKD diagnosis. Romanian population suitability and equation sex-coefficient selection need clinical review.

**Derived fixtures:** age 60/Scr 1 mg/dL → male 86.1626207797, female 64.4950003539. At male Scr 0.9 → 97.7750144829; female Scr 0.7 → 98.9483146567. Test either side of both knots/continuity, age 17/18, units, missing/invalid Scr and unrounded SI conversion before branching. No published individual worked example verified. Display precision/rights remain review decisions.

## 5. Albumin-adjusted total calcium

**Primary checked via abstract:** Payne RB, Little AJ, Williams RB, Milner JR. Interpretation of serum calcium in patients with abnormal serum proteins. _Br Med J._ 1973;4:643–646. [DOI 10.1136/bmj.4.5893.643](https://doi.org/10.1136/bmj.4.5893.643), [primary abstract](https://pubmed.ncbi.nlm.nih.gov/4758544/).

```text
Original Payne: adjusted Ca [mg/dL] = total Ca [mg/dL] − albumin [g/dL] + 4.0
Derived SI using rounded Ca ×0.25:
adjusted Ca [mmol/L] = total Ca [mmol/L] + 0.025×(40−albumin [g/L])
```

**Competing version:** common simplified form `Ca[mmol/L]+0.02×(40−albumin[g/L])`, equivalent under that conversion to `Ca[mg/dL]+0.8×(4−albumin[g/dL])`. **0.8 is not the original Payne coefficient.** Both appear separately in Desgagnés N et al. Use of albumin-adjusted calcium measurements in clinical practice. _JAMA Netw Open._ 2025;8:e2455251. [DOI 10.1001/jamanetworkopen.2024.55251](https://doi.org/10.1001/jamanetworkopen.2024.55251), Methods/Supplement 1 eTable 2. That primary study found substantial misclassification against ionized calcium, worse with hypoalbuminemia. It also compares Orrell/Berry/James; this does not select one for InterMED.

**Recommendation/limits:** defer routine correction in v1. Adjusted total Ca does not measure ionized Ca. The original derivation does not establish general applicability in critical illness, dialysis, CKD, acid–base disorders, pregnancy or pediatrics. Laboratory/clinical review must settle assay dependence, albumin range and interpretation. No source-specific rounding or redistribution permission verified.

**Derived fixtures:** total Ca 8 mg/dL/albumin 2 g/dL → original 10 mg/dL (2.50 mmol/L), simplified 9.6 mg/dL (2.40 mmol/L). Albumin 4 g/dL/40 g/L leaves Ca unchanged. Test missing/invalid total Ca/albumin, equivalent units, albumin above 40 and approved validity limits. Do not add an unsourced low-albumin-only rule/clamp. No published numerical worked example verified.

## 6. Glucose-adjusted sodium

**Primary references:** Katz MA. Hyperglycemia-induced hyponatremia—calculation of expected serum sodium depression. _N Engl J Med._ 1973;289:843–844. [DOI 10.1056/NEJM197310182891607](https://doi.org/10.1056/NEJM197310182891607). Hillier TA, Abbott RD, Barrett EJ. Hyponatremia: evaluating the correction factor for hyperglycemia. _Am J Med._ 1999;106:399–403. [DOI 10.1016/S0002-9343(99)00055-8](<https://doi.org/10.1016/S0002-9343(99)00055-8>), [primary abstract checked](https://pubmed.ncbi.nlm.nih.gov/10225241/).

```text
Baseline-100 conventional form:
adjusted Na [mmol/L] = measured Na + c×(glucose [mg/dL]−100)/100
Katz c=1.6; Hillier overall c=2.4
Derived SI using glucose mg/dL ÷18:
adjusted Na = measured Na + (c/(100/18))×(glucose [mmol/L]−100/18)
```

Hillier studied six healthy volunteers and observed nonlinearity: 1.6 worked up to glucose 400 mg/dL, 4.0 fitted the higher range better, 2.4 was the overall estimate. Do not invent a piecewise equation applying 4.0 to all glucose above baseline. Katz full-letter confirmation of baseline-100 algebra remains open; factors are corroborated by Hillier. The [European guideline §6.1.2](https://doi.org/10.1530/EJE-13-1020) supplies a 2.4 operational approach using rounded SI baseline/increment 5.5; it is not exactly the ÷18 algebra above.

**Recommendation/limits:** defer until a reviewer selects coefficient, baseline and SI rounding. Hyperglycemia-related estimate, not a sodium-treatment target or infusion/correction-rate protocol. Small-experiment evidence does not establish pregnancy, pediatric, dialysis or complex-fluid-loss applicability. Do not conflate with analytical pseudohyponatremia or extrapolate below baseline without review.

**Derived fixtures:** Na 130 mmol/L/glucose 300 mg/dL → Katz 133.2, Hillier-overall 134.8. Glucose 100 leaves Na unchanged. Test missing/invalid glucose/Na, baseline, 400 and either side, equivalent SI and rejected low-glucose use. No published individual worked example or mandated precision verified. Expression reuse rights unresolved.

## 7. Caprini — version and rights gates

**Primary references:** Caprini JA. Thrombosis risk assessment as a guide to quality patient care. _Dis Mon._ 2005;51:70–78. [DOI 10.1016/j.disamonth.2005.02.003](https://doi.org/10.1016/j.disamonth.2005.02.003) (citation checked, full 2005 form unverified). Cronin M et al. Completion of the updated Caprini risk assessment model (2013 version). _Clin Appl Thromb Hemost._ 2019;25:1076029619838052. [DOI 10.1177/1076029619838052](https://doi.org/10.1177/1076029619838052), [author article](https://pmc.ncbi.nlm.nih.gov/articles/PMC6714938/), completion tables pp.6–9 checked.

**Scoring evidence:** weighted sum of 1/2/3/5-point factors; ages 41–60/61–74/≥75 add 1/2/3. Separate prior VTE episodes add 3 each; elective hip/knee arthroplasty adds 5. Additional 2013 one-point factors include BMI >40, smoking, insulin-treated diabetes, chemotherapy and transfusion. Do not graft additions onto “2005”. Units include years, BMI kg/m² and hours/minutes; integer weights need no rounding.

**Verified 2013 surgery criterion:** Cronin's [provider completion table, pp.7–8](https://rcastoragev2.blob.core.windows.net/2137000e856131e7a3352b1a52408925/PMC6714938.pdf#page=7) names “Length of surgery over 2 hours”: +1 for actual current surgery exceeding 120 minutes, including anesthesia time. The planned major-surgery >45-minute row (including laparoscopic/arthroscopic procedures) explicitly adds this point to its +2 when duration exceeds two hours; it is not an alternative. Neither addition applies to the five-point total hip/knee replacement item. Exactly 120 minutes does not meet >120. These are versioned source instructions, not clinical approval.

**Published example:** prior DVT in 2014 and PE in 2015 → 6 for two separate events; simultaneous DVT/PE → 3 (2019 completion table). These are source illustrative histories, not imported patient records.

**Explicit incomplete oracle:** a complete machine-ready item inventory and all double-counting/exclusion rules are not reproduced or approved here. Patient-friendly and provider instructions need reconciliation, including HIV/thrombophilia handling. Exactly 45-minute surgery and other overlapping mobility/surgery categories remain unresolved; the >120-minute addition above is explicitly sourced. This gap blocks implementing the full tool from this document.

**Preference/limits:** defer v1; compare exact 2005 validation evidence with 2013 semantics before selecting. Specialty-specific risk bands and prophylaxis require separate review. Pregnancy-related items do not establish obstetric/pediatric/general-medical validation. Obesity/mobility are inputs, not blanket renal-style exclusions.

**Rights:** 2019 article states CC BY-NC 4.0; this is not proof of unrestricted commercial/offline/translation rights to the instrument or embedded forms. No permission obtained. Do not distribute questionnaire/graphics/translations under Apache-2.0. Record rightsholder, exact intended distribution and permission first.

**Proposed tests:** individual factors, ages 40/41/60/61/74/75, BMI 25/40 and either side, mobility 72 hours, time windows, surgery 45 minutes and 120 minutes ± a small increment; derived surgery-only subtotal 2 at 120 minutes versus 3 above 120 for a qualifying non-joint major procedure; total hip/knee replacement stays 5 without those additions; separate/simultaneous VTE and missing history. Unasked items must not become zero. Complete oracle/rights review is still required.

## 8. SOFA versus qSOFA

**Primary references:** Vincent JL et al. The SOFA (Sepsis-related Organ Failure Assessment) score to describe organ dysfunction/failure. _Intensive Care Med._ 1996;22:707–710. [DOI 10.1007/BF01709751](https://doi.org/10.1007/BF01709751), [ESICM-hosted original scan, p.708 Table 3](https://www.esicm.org/wp-content/uploads/2018/03/esicmworking5-2.pdf#page=2), visually checked during PR review. The original table has columns 1–4; the surrounding text defines 0 as normal. Singer M et al. The third international consensus definitions for sepsis and septic shock (Sepsis-3). _JAMA._ 2016;315:801–810. [DOI 10.1001/jama.2016.0287](https://doi.org/10.1001/jama.2016.0287), Table 1 checked. Seymour CW et al. Assessment of clinical criteria for sepsis. _JAMA._ 2016;315:762–774. [DOI 10.1001/jama.2016.0288](https://doi.org/10.1001/jama.2016.0288), qSOFA primary abstract checked.

SOFA sums six organ subscores 0–4 (total 0–24). **Research restatement:** the table below makes inequalities explicit. R=PaO2/FiO2, P=platelets, B=bilirubin, C=creatinine, U=urine output, d=dopamine, e=epinephrine, n=norepinephrine. A range's two endpoints are inclusive only where both ≤ signs appear. GCS requires a valid integer score.

**Precedence status:** Vincent p.708 specifies daily worst values and orders 0 (normal) to 4 (most abnormal). Selecting the highest matching criterion below is a **derived normalization**, not a quoted, clinically reviewed algorithm. It gives the disjoint R/P intervals shown and excludes a lower cardiovascular/renal candidate when a higher one matches. Whether to combine simultaneous pressors or creatinine/urine this way, exact timing, and support/missing-data definitions still require clinical review. Do not mistake daily worst-value collection for a complete implementation specification.

| Component                | 0 points                     | 1 point                           | 2 points                                                         | 3 points                                                       | 4 points                                |
| ------------------------ | ---------------------------- | --------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| R, mmHg                  | R ≥400                       | 300 ≤ R <400                      | 200 ≤ R <300, or R <200 without respiratory support              | Support and 100 ≤ R <200                                       | Support and R <100                      |
| P, 10³/µL                | P ≥150                       | 100 ≤ P <150                      | 50 ≤ P <100                                                      | 20 ≤ P <50                                                     | P <20                                   |
| B, mg/dL                 | B <1.2                       | 1.2 ≤ B ≤1.9                      | 2.0 ≤ B ≤5.9                                                     | 6.0 ≤ B ≤11.9                                                  | B >12.0; equality **unverified**        |
| Circulation              | MAP ≥70, no higher criterion | MAP <70, no higher criterion      | Administered d ≤5 or dobutamine at any dose, no higher criterion | Administered 5 < d ≤15, e ≤0.1 or n ≤0.1, no 4-point criterion | Administered d >15, e >0.1 or n >0.1    |
| GCS                      | GCS =15                      | 13 ≤ GCS ≤14                      | 10 ≤ GCS ≤12                                                     | 6 ≤ GCS ≤9                                                     | GCS <6                                  |
| Renal: C mg/dL; U mL/day | C <1.2, no higher criterion  | 1.2 ≤ C ≤1.9, no higher criterion | 2.0 ≤ C ≤3.4, no higher criterion                                | 3.5 ≤ C ≤4.9 or U <500, no 4-point criterion                   | C >5.0 or U <200; C =5.0 **unverified** |

MAP is in mmHg. Drug predicates apply to administered agents, not absent agents encoded as zero; units are µg/kg/min for at least one hour. **Version difference:** Vincent Table 3 prints dopamine ≤5 (2 points) and >5 (3 points, superseded by >15 for 4 under the derived precedence). Thus exactly 5 belongs to its 2-point criterion. Singer Table 1 instead prints <5 and 5.1–15, leaving a gap; do not merge those cardiovascular versions. The cardiovascular row above follows Vincent, not Singer.

**Unverified boundaries retained:** both primary tables print B >12.0 and C >5.0, so neither verifies replacing these with ≥12.0/≥5.0. Literal laboratory gaps are 1.9 < B <2.0, 5.9 < B <6.0, 11.9 < B ≤12.0; 1.9 < C <2.0, 3.4 < C <3.5, 4.9 < C ≤5.0. These values are **unverified**, not normal or automatically assigned to the next bin, even if another predicate matches. Urine predicates overlap below 200; the derived highest-match rule would choose 4, and exactly 200 meets <500 only. Missing FiO2/support, sedation-confounded GCS or incomplete urine collection cannot become normal. Resolve gaps, precedence and SI/conventional discrepancies with an authoritative correction and clinical reviewer; no rounding into bins or clinical approval is supplied here.

**qSOFA:** 1 each for respiratory rate ≥22/min, systolic BP ≤100 mmHg and altered mentation, sum 0–3. Sepsis-3 operational text uses GCS <15; distinguish operational versus derivation mentation definitions. ≥2 flags higher-risk adults with suspected infection, particularly outside ICU; it does not establish/exclude sepsis. SOFA organ dysfunction/change from baseline has a different purpose. [Surviving Sepsis Campaign 2021, screening recommendation](https://doi.org/10.1007/s00134-021-06506-y) advises against qSOFA as sole screening.

**Preference/limits:** defer both pending purpose, baseline/timing, respiratory-support, threshold and missing-data review. No pediatric/pregnancy validation or automatic mortality/treatment advice established. SOFA renal dialysis handling is not MELD's rule.

**Derived fixtures:** qSOFA RR 22/SBP 100/explicit normal mentation → 2; RR 21/SBP 101/normal → 0. SOFA P/F 450, platelets 200, bilirubin 1, MAP 80/no pressors, GCS 15, Scr 1/urine 1000 mL/day → 0; same with platelets 40 → 3. Test every cutoff/gap, FiO2 percent/fraction, urine time denominator, competing pressors and missing components. No published numeric worked case verified. Publisher/instrument distribution rights unresolved.

## 9. Child–Pugh — original PT versus modern INR variant

**Primary reference:** Pugh RNH, Murray-Lyon IM, Dawson JL, Pietroni MC, Williams R. Transection of the oesophagus for bleeding oesophageal varices. _Br J Surg._ 1973;60:646–649. [DOI 10.1002/bjs.1800600817](https://doi.org/10.1002/bjs.1800600817). Citation checked; original full-table thresholds unverified. Historical Child–Turcotte used different clinical variables; a later INR adaptation must not be presented as original 1973 scoring.

For a named **modern INR variant**, [NIH adult/adolescent HIV guideline, Child-Pugh classifications](https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/drug-characteristics-tables-renal-hepatic-insufficiency-full) institutionally confirms:

| Item                   | 1 / 2 / 3 points                                                              |
| ---------------------- | ----------------------------------------------------------------------------- |
| Total bilirubin, mg/dL | <2 / 2–3 / >3                                                                 |
| Albumin, g/dL          | >3.5 / 2.8–3.5 / <2.8                                                         |
| INR                    | <1.7 / 1.7–2.3 / >2.3                                                         |
| Ascites                | None / mild or diuretic-controlled / moderate or refractory despite diuretics |
| Encephalopathy         | None / grades 1–2 / grades 3–4                                                |

Sum five: 5–6 class A, 7–9 B, 10–15 C. Common PT-prolongation alternatives use <4 / 4–6 / >6 seconds above control; **original primary-table confirmation/variant lineage remains unverified**. PT seconds and INR are alternative definitions, not two additive items. Cholestatic bilirubin modifications require separate sourcing; no substitute thresholds approved here.

**Preference/limits:** defer. Modern table supports research fixtures, not an “original Pugh verified” claim. Ascites/encephalopathy require clinician classification and treatment-context definitions. Anticoagulant-driven INR, albumin infusions, acute liver failure, renal failure, pregnancy and pediatrics need applicability review. No universal hepatic dosing algorithm. Integer sum needs no rounding; source-expression rights unresolved.

**Derived fixtures, modern table only:** all 1-point categories → 5/A. Bilirubin 2.5 mg/dL, albumin 3 g/dL, INR 2, mild ascites, grade 1 encephalopathy → 10/C. Test bilirubin 2/3, albumin 2.8/3.5, INR 1.7/2.3, class 6/7 and 9/10, unknown categories and SI equivalence. No original published worked example verified.

## 10. MELD, MELD-Na and MELD 3.0

**Primary lineage:** Malinchoc M et al. A model to predict poor survival in patients undergoing transjugular intrahepatic portosystemic shunts. _Hepatology._ 2000;31:864–871. [DOI 10.1053/he.2000.5852](https://doi.org/10.1053/he.2000.5852). Kamath PS et al. A model to predict survival in patients with end-stage liver disease. _Hepatology._ 2001;33:464–470. [DOI 10.1053/jhep.2001.22172](https://doi.org/10.1053/jhep.2001.22172). Original derivation full texts not fully checked; later allocation expression is not the original TIPS etiology-containing model.

Kim WR et al. Hyponatremia and mortality among patients on the liver-transplant waiting list. _N Engl J Med._ 2008;359:1018–1026. [DOI 10.1056/NEJMoa0801209](https://doi.org/10.1056/NEJMoa0801209). Kim WR et al. MELD 3.0: the model for end-stage liver disease updated for the modern era. _Gastroenterology._ 2021;161:1887–1895.e4. [DOI 10.1053/j.gastro.2021.08.050](https://doi.org/10.1053/j.gastro.2021.08.050), [primary manuscript](https://pmc.ncbi.nlm.nih.gov/articles/PMC8608337/), [publisher-paper copy](https://sites.duke.edu/gijournalclub/files/2022/02/1-s2.0-S0016508521034697-main.pdf), Methods/Results/illustrative cases checked.

All logarithms are natural. B=bilirubin mg/dL, C=creatinine mg/dL, A=albumin g/dL, Na=mmol/L, INR dimensionless. Convert before clamps/logs.

```text
Later conventional MELD comparator in Kim 2021:
M = round(3.78×ln(B) + 11.20×ln(INR) + 9.57×ln(C) + 6.43)

MELD-Na comparator in Kim 2021:
round(M + 1.32×(137−Na) − 0.033×M×(137−Na))

MELD 3.0, Kim 2021:
round(1.33×female + 4.56×ln(B) + 0.82×(137−Na)
      − 0.24×(137−Na)×ln(B) + 9.09×ln(INR) + 11.14×ln(C)
      + 1.85×(3.5−A) − 1.83×(3.5−A)×ln(C) + 6)
female = 1 or 0 for the model's coefficient.
```

Kim 2021 floors B/INR/C at 1; conventional MELD C ceiling 4 and C=4 for ≥2 dialysis treatments in the previous week. MELD 3.0 lowers C ceiling to 3, bounds Na 125–137 and A 1.5–3.5. Preserve rounding of M before comparator MELD-Na. Earlier sodium models differ: Kim 2008 reports `M−Na−0.025×M×(140−Na)+140` with Na 125–140. Biggins et al. 2006 [DOI 10.1053/j.gastro.2006.02.010](https://doi.org/10.1053/j.gastro.2006.02.010) proposed another approach; its full-text coefficients are unverified here. Never infer a model from generic “MELD-Na”.

**Policy differs:** [OPTN MELD/PELD guide pp.3–4](https://www.hrsa.gov/sites/default/files/hrsa/optn/meld-peld-calculator-user-guide.pdf) explicitly sets C=3 for ≥2 dialysis treatments or ≥24 h CVVHD in the prior week, clamps inputs, rounds to nearest whole number and bounds scores 6–40. It distinguishes current/registration age and adolescent/adult sex-coefficient handling. These are US allocation rules, not Romanian practice or uncapped research output. Exact ties, historic MELD-Na >11 policy, original-paper MELD 3.0 dialysis details and local allocation rules remain unverified. Do not extrapolate adult formula to children or implement malformed adolescent PDF text extraction.

**Preference/limits:** if later selected for adult prognosis, favor explicitly named MELD 3.0 over historical defaults; defer liver tools initially. Adult transplant-candidate evidence is not general acute-illness/surgical validation. Pregnancy, pediatrics, anticoagulant INR, amputation/muscle extremes and albumin treatment need review. Dialysis has a model-specific policy. No unsourced mortality percentages/listing-priority claims.

**Published vectors:** Kim 2021 illustrative table (Table 4 in PMC manuscript, Table 5 in publisher PDF) gives B = 2.5, Na = 131, INR = 1, C = 1.2, A = 3.8: male MELD 12 / MELD-Na 18 / MELD 3.0 16; same female 12 / 18 / 17. A is capped at 3.5 for MELD 3.0. Lead recomputation gives raw MELD 3.0 values 15.8098892261/17.1398892261. These are published examples, not synthetic fixtures.

**Tests:** all clamps immediately below/at/above 1, C 3 versus 4, Na 125/137, A 1.5/3.5; invalid log inputs; dialysis type/timing; integer ties; policy 6/40 versus paper output; age 12/18. Missing dialysis/labs cannot become normal. Rights to paper/policy expression and redistribution unverified.

## 11. Wells DVT versus Wells PE

**Primary references:** Wells PS et al. Value of assessment of pretest probability of deep-vein thrombosis in clinical management. _Lancet._ 1997;350:1795–1798. [DOI 10.1016/S0140-6736(97)08140-3](<https://doi.org/10.1016/S0140-6736(97)08140-3>). Wells PS et al. Evaluation of D-dimer in the diagnosis of suspected deep-vein thrombosis. _N Engl J Med._ 2003;349:1227–1235. [DOI 10.1056/NEJMoa023153](https://doi.org/10.1056/NEJMoa023153). Wells PS et al. Excluding pulmonary embolism at the bedside without diagnostic imaging. _Ann Intern Med._ 2001;135:98–107. [DOI 10.7326/0003-4819-135-2-200107170-00010](https://doi.org/10.7326/0003-4819-135-2-200107170-00010).

**PE derivation reference:** Wells PS et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism: increasing the models utility with the SimpliRED D-dimer. _Thromb Haemost._ 2000;83:416–420. [DOI 10.1055/s-0037-1613830](https://doi.org/10.1055/s-0037-1613830), [primary abstract](https://pubmed.ncbi.nlm.nih.gov/10744147/). NICE attributes its PE adaptation to this 2000 paper; the 2001 paper above is subsequent management validation. Full original table remains unverified.

Citations/2003 abstract checked; full original scoring-table verification remains open. These proposed **two-level guideline variants** are cross-checked against [NICE NG158 Tables 1–2](https://www.nice.org.uk/guidance/ng158/chapter/Recommendations) and its [visual summary](https://www.nice.org.uk/guidance/ng158/resources/visual-summary-pdf-11193380893). Direct retrieval was restricted; indexed official content was accessible. Recheck complete live tables before implementation.

| Tool | Weights and definitions                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DVT  | +1 each: active cancer (ongoing/within 6 months/palliative); paralysis/paresis/recent leg plaster; bedrest ≥3 days or major surgery within 12 weeks with general/regional anesthesia; deep-vein tenderness; whole-leg swelling; calf difference ≥3 cm; unilateral pitting edema; nonvaricose collateral veins; previous documented DVT. −2: alternative diagnosis at least as likely. ≥2 likely; ≤1 unlikely. |
| PE   | +3 each: DVT clinical signs; alternative diagnosis less likely than PE. +1.5 each: pulse >100/min; immobilization >3 days or surgery within 4 weeks; previous DVT/PE. +1 each: hemoptysis; malignancy (treatment/within 6 months/palliative). >4 likely; ≤4 unlikely.                                                                                                                                         |

[ESC consensus Table 1](https://academic.oup.com/eurheartj/article/39/47/4208/3002647) specifies calf measurement 10 cm below the tibial tuberosity; NICE defines PE-tool DVT signs as at least leg swelling and deep-vein palpation pain. Time-window inclusivity still needs review. Original three-level and revised two-level models differ; do not mix DVT 12-week and PE 4-week windows or reuse probability labels. Generic “Wells” is not a formula ID. These are pretest probability tools in diagnostic pathways, not standalone exclusion/diagnosis or anticoagulation instructions.

**Preference/limits:** defer until two separately named instruments and an exact diagnostic pathway receive review. Original outpatient suspected-VTE evidence does not automatically validate pregnancy, pediatric, already-anticoagulated or inpatient use. Weight/renal function are not direct inputs; that does not establish all obesity/amputation/dialysis subgroup validity. Unknown history/subjective alternative diagnosis remains unknown.

**Derived fixtures:** DVT whole-leg swelling+calf ≥3 cm/all others false → 2; add equally likely alternative → 0. PE DVT signs+tachycardia → 4.5; DVT signs+hemoptysis → 4. No publication worked patient vector verified. Test DVT 1/2, PE 4/4.5, pulse 100/101, calf 2.99/3 cm, time windows and missing alternatives. Retain half-points; no score rounding. Original forms/translation/offline/commercial rights unverified; NICE access does not establish the instrument license.

## Recommended initial set and remaining gates

| Disposition            | Candidates                               | Reason/remaining gate                                                                                                             |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| First review group     | Numeric adult BMI; Mosteller BSA         | Small deterministic scope; close BSA original-source access, rights, population and precision review; no dosing/category promises |
| Conditional next group | Cockcroft–Gault; CKD-EPI 2021 creatinine | Distinct renal outputs; weight, coefficient-selection, assay/population limits and clinician-checked fixtures required            |
| Defer                  | Corrected calcium                        | Competing coefficients and misclassification evidence                                                                             |
| Defer                  | Corrected sodium                         | Coefficient/baseline choice, nonlinearity and treatment implications                                                              |
| Defer                  | Caprini                                  | Rights, complete item semantics and version/population validation                                                                 |
| Defer                  | SOFA/qSOFA                               | Timing, support, missingness and threshold gaps; qSOFA not sole screening                                                         |
| Defer                  | Child–Pugh/MELD                          | Variant lineage, subjective inputs and allocation-policy differences                                                              |
| Defer                  | Wells DVT/PE                             | Separate instruments/pathways; primary-table and population checks incomplete                                                     |

This review order is not approval or M11 completion and does not change milestone sequencing. Before implementation/release record:

1. Stable formula ID/version, exact primary equation/table location and checked corrections/errata. Resolve unverified rules and obtain a complete approved Caprini item oracle.
2. Named clinical reviewer/date, intended purpose/population, Romanian applicability, excluded/uncertain states, missing-data policy and rounding/display conventions. No clinical reviewer/approval is supplied here.
3. Rights owner/evidence, implementation/wording, attribution, adaptation/translation, commercial distribution and offline scope. No instrument-specific grant is recorded here. Formula facts/original paraphrases do not license publisher text/tables/forms/trademarks or another calculator's code. Obtain rights assessment; do not bundle source PDFs.
4. Independent clinically reviewed reference cases and executed positive/negative/boundary/missing/unit tests. Keep published versus derived provenance. Proposed research arithmetic tolerance: 1e-8 absolute in canonical units, before display rounding; exact discrete decisions. Fixture agreement proves arithmetic only, not clinical validity.
5. Accessible source/version/units/limitations alongside results, ephemeral inputs and no auto-population/input logging. No dosing, prophylaxis, diagnostic, sepsis-exclusion or transplant-allocation advice inferred from a number.

## Delivery evidence and limitations

The lead recalculated derived BMI/BSA/CrCl/CKD-EPI fixtures and the two published MELD 3.0 cases using Node 24.21.0 arithmetic. This adds one research document; no application behavior or clinical tests were run. Formatting, encoding and scope checks are delivery checks, not formula approval. Worker evidence contained citation errors/inaccessible-source gaps; final references reflect independent reconciliation, including the correct Cockcroft–Gault journal/DOI and Payne coefficient distinction. Complete Caprini scoring, inaccessible original publications, exact SOFA boundary resolution, licenses and clinical review remain explicitly open.
