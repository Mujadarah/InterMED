# Surgery and ICU calculator candidates — primary-source assessment (2026-10)

Assessment date: 2026-10-20. Scope: the surgery/ICU shortlist in
[MEDIATELY_ANALYSIS_2026-10, recommendation 3](MEDIATELY_ANALYSIS_2026-10.md),
assessed with the method and evidence labels of the
[CALCULATOR_SOURCE_ASSESSMENT](../CALCULATOR_SOURCE_ASSESSMENT.md).

**Research only: not clinical approval, M11 acceptance or authorization for
clinical release.** No code, patient data or live Appwrite changes. Every
candidate here is rights-review-pending and clinical-review-pending. The owner
selects which candidates enter the M11 process; selection is not approval.
Nothing below establishes a diagnosis, a prophylaxis decision, a disposition,
a sepsis rule or a mortality estimate for an individual patient.

## Method and evidence labels

- **Bibliographic verification.** Every DOI in this document was resolved
  through the DOI resolver on 2026-10-20 and independently matched to its
  PubMed/Europe PMC record (authors, title, journal, year, volume, pages,
  PMID). Redirects returning HTTP 403 are publisher bot-blocks, not failed
  DOI resolution. A resolved citation is not a read full text.
- **Full text or abstract checked.** Named where used. Most primary papers
  were read only as indexed abstracts or open full text.
- **Rights page checked.** The rightsholder's own wording was read where a
  page was reachable. A blocked page is marked unverified, not assumed
  permissive.
- **Unverified.** Any fact, boundary, licence term or recommendation class
  not confirmed against a primary or official source is marked **unverified**
  and blocks implementation until closed.

Searches and page reads were performed with a web fetch tool; no login,
paywall bypass or scraping was used. The ASA page was bot-blocked, so a
2025-12-05 Wayback Machine snapshot of the official page was read instead
(recorded below). The RCP NEWS2 report PDF and several open-access full texts
were read directly.

Numeric ranges and boundaries below are commonly printed summaries. Unless a
section says the primary table was read, they are **not** a substitute for the
reviewer's source table; the review gate includes re-reading the exact item
definitions and boundaries.

## Shared rules proposed for every candidate

1. **Adults only by default.** Paediatric and pregnancy use is excluded unless
   the source validates it and a reviewer approves it. Age alone never
   establishes validity.
2. **Manual, ephemeral inputs.** No profiles, auto-population, order feeds or
   telemetry. Inputs are not logged with results.
3. **No silent normalisation.** A missing input is not zero, not normal and
   not automatically the lowest-risk bin. Unasked items must not score zero.
4. **Show the components.** Display the per-item contributions, the exact
   version, the primary source and the units next to the result.
5. **No derived clinical action.** No dose, prophylaxis regimen, antibiotic,
   admission/discharge order, imaging order or sepsis verdict follows from a
   number.
6. **Rounding.** Classify on unrounded values; keep exact integer or
   half-point sums; use one documented display precision per instrument.
7. **Units are part of the formula.** Urea is not urea nitrogen; creatinine
   mg/dL is not µmol/L; FiO2 is a fraction, not a percentage; haemoglobin
   thresholds can be sex-specific; SpO2 scale 1 is not scale 2.
8. **Version is part of the identity.** A generic name (“Wells”, “Caprini”,
   “GCS”) is not a formula ID. Two-level and three-level variants, 2005 and
   2013 versions, and pre-/post-endoscopy scores are separate instruments.

## Summary table

| Candidate             | Purpose                                      | Primary source                | Rights status                                        | Subjectivity  | MDR note                          | Fit         |
| --------------------- | -------------------------------------------- | ----------------------------- | ---------------------------------------------------- | ------------- | --------------------------------- | ----------- |
| Caprini (2005 / 2013) | Adult surgical VTE risk to guide prophylaxis | Caprini 2005; Cronin 2019     | Copyright claimed; instrument licence **unverified** | High          | MDSW likely; IIa start            | Medium      |
| qSOFA                 | Risk flag in suspected infection             | Singer 2016; Seymour 2016     | No statement found; **unverified**                   | Low–medium    | MDSW likely; IIa                  | Medium      |
| SOFA                  | ICU organ dysfunction; Sepsis-3              | Vincent 1996                  | No statement found; **unverified**                   | Medium        | MDSW likely; IIa/IIb              | Medium      |
| NEWS2                 | Adult deterioration monitoring               | RCP 2017                      | Free with attribution/conditions (verified)          | Low           | MDSW likely; IIb monitoring risk  | Low–medium  |
| Glasgow Coma Scale    | Consciousness assessment                     | Teasdale 1974; Teasdale 2014  | Free with attribution (verified)                     | Medium–high   | Documentation vs decision support | High        |
| Alvarado / AIR        | Suspected appendicitis triage                | Alvarado 1986; Andersson 2008 | No statement found; **unverified**                   | High / medium | MDSW likely; IIa                  | Medium–high |
| Glasgow–Blatchford    | Acute UGIB pre-endoscopy risk                | Blatchford 2000               | No statement found; **unverified**                   | Low–medium    | MDSW likely; IIa                  | High        |
| Wells DVT             | Suspected DVT pretest probability            | Wells 1997; Wells 2003        | No statement found; **unverified**                   | High          | MDSW likely; IIa                  | Medium      |
| Wells PE              | Suspected PE pretest probability             | Wells 2000; Wells 2001        | No statement found; **unverified**                   | High          | MDSW likely; IIa                  | Medium      |
| Revised Geneva        | Suspected PE pretest probability             | Le Gal 2006                   | No statement found; **unverified**                   | Low–medium    | MDSW likely; IIa                  | Medium      |
| PESI / sPESI          | Prognosis in confirmed PE                    | Aujesky 2005; Jiménez 2010    | No statement found; **unverified**                   | Low           | MDSW likely; IIa                  | Medium–low  |
| Padua                 | VTE risk in medical inpatients               | Barbar 2010                   | No statement found; **unverified**                   | Medium        | MDSW likely; IIa                  | Low         |
| CURB-65               | CAP mortality risk and disposition           | Lim 2003                      | No statement found; **unverified**                   | Low–medium    | MDSW likely; IIa                  | Low–medium  |
| APACHE II             | ICU severity and prognosis                   | Knaus 1985                    | Trademark; permission **unverified**                 | Medium        | MDSW likely; IIa/IIb              | Low         |
| ASA physical status   | Pre-anaesthesia comorbidity class            | ASA 2020                      | Written consent required (verified)                  | High          | Documentation vs decision support | Low         |
| RCRI (Lee)            | Noncardiac surgery cardiac risk              | Lee 1999                      | No statement found; **unverified**                   | Low–medium    | MDSW likely; IIa                  | High        |

“MDSW likely” is a qualification hypothesis under the
[MDR assessment](../REGULATORY_ASSESSMENT_MDR.md), not a classification
decision. “Documentation vs decision support” means the same inputs can sit on
either side of the MDR line depending on whether the tool records a clinician’s
judgement or suggests one.

---

## 1. Caprini VTE risk model (2005 and 2013 versions)

**1. Purpose and population.** Adult surgical inpatients. It stratifies
postoperative venous thromboembolism (VTE) risk to support prophylaxis
decisions. The 2005 publication describes the original model; the earlier
version was validated retrospectively in general and plastic surgery, and the
2013 completion adds an arthroplasty validation. It is not a
medical-inpatient tool (see Padua), and it
is not validated for paediatrics. Pregnancy and postpartum items exist in the
form, but their presence does not establish obstetric validation.

**2. Primary reference.** Caprini JA. Thrombosis risk assessment as a guide to
quality patient care. _Dis Mon._ 2005;51(2–3):70–78.
[DOI 10.1016/j.disamonth.2005.02.003](https://doi.org/10.1016/j.disamonth.2005.02.003),
[PMID 15900257](https://pubmed.ncbi.nlm.nih.gov/15900257/). Citation verified;
the complete 2005 form was not re-read from the publisher.

Version update: Caprini JA. Risk assessment as a guide for the prevention of
the many faces of venous thromboembolism. _Am J Surg._ 2010;199(1
Suppl):S3–S10.
[DOI 10.1016/j.amjsurg.2009.10.006](https://doi.org/10.1016/j.amjsurg.2009.10.006),
[PMID 20103082](https://pubmed.ncbi.nlm.nih.gov/20103082/).

Completion/implementation paper: Cronin M, Dengler N, Krauss ES, et al.
Completion of the updated Caprini risk assessment model (2013 version). _Clin
Appl Thromb Hemost._ 2019;25:1076029619838052.
[DOI 10.1177/1076029619838052](https://doi.org/10.1177/1076029619838052),
[PMID 30939900](https://pubmed.ncbi.nlm.nih.gov/30939900/),
[open full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC6714938/). Full text
and completion definitions checked.

Validation: Bahl V, Hu HM, Henke PK, et al. A validation study of a
retrospective venous thromboembolism risk scoring method. _Ann Surg._
2010;251(2):344–350.
[DOI 10.1097/SLA.0b013e3181b7fca6](https://doi.org/10.1097/SLA.0b013e3181b7fca6),
[PMID 19779324](https://pubmed.ncbi.nlm.nih.gov/19779324/). Pannucci CJ,
Bailey SH, Dreszer G, et al. Validation of the Caprini risk assessment model in
plastic and reconstructive surgery patients. _J Am Coll Surg._
2011;212(1):105–112.
[DOI 10.1016/j.jamcollsurg.2010.08.018](https://doi.org/10.1016/j.jamcollsurg.2010.08.018),
[PMID 21093314](https://pubmed.ncbi.nlm.nih.gov/21093314/). Cronin 2019 adds an
arthroplasty validation and specialty cut-offs.

Guideline position: ASH 2019 surgical VTE guideline describes the Caprini
score as a validated postoperative scoring system but does not mandate it
([DOI 10.1182/bloodadvances.2019000975](https://doi.org/10.1182/bloodadvances.2019000975),
[PMID 31794602](https://pubmed.ncbi.nlm.nih.gov/31794602/); full-text
discussion checked). ACCP/CHEST 2012 adopted the Caprini and Rogers risk
calculators for nonorthopaedic surgical patients
([DOI 10.1378/chest.11-2297](https://doi.org/10.1378/chest.11-2297),
[PMID 22315263](https://pubmed.ncbi.nlm.nih.gov/22315263/); abstract and ASH
summary checked). NICE NG89 requires VTE and bleeding risk assessment for all
surgical patients but names no specific score
([NG89](https://www.nice.org.uk/guidance/ng89), published 2018, updated 2019;
recommendations page checked, no Caprini mention).

**3. Inputs and units.** Age (years), BMI (kg/m²), planned and actual surgery
type and duration (minutes/hours), mobility and bed rest (days), pregnancy and
postpartum state, hormonal treatment, prior VTE, family history, thrombophilia
results, active cancer, central venous access, cast, sepsis, cardiopulmonary
disease and other comorbidities. A large share of the items are clinical
judgement or history recall, not laboratory values. Time windows (“within the
past month”, “within 6 months”) matter.

**4. Scoring rules and version differences.** A weighted sum: selected items
score 1, 2, 3 or 5 points. Age 41–60, 61–74 and ≥75 adds 1, 2 and 3
respectively. The 2013 version adds one-point factors: BMI above 40, current
smoking, insulin-treated diabetes, chemotherapy, blood transfusion, and
surgery longer than 2 hours. The >2-hour point is explicitly not added to the
five-point total hip/knee replacement item. The 2005 form uses BMI above 25 as
its obesity item, not BMI above 40; the two versions must not be mixed. Risk
bands are not one universal set: the 2005 bands (0–1 low, 2 moderate, 3–4
high, ≥5 highest) and specialty cut-offs of 5, 10 or 12 appear in the
literature, but the band boundaries themselves remain **unverified**. The table
and its item definitions are not reproduced here; a complete machine-ready item
inventory and the double-counting rules remain **unverified**.

**5. Rights.** The official Caprini site displays “© Copyright 2026 Caprini
Risk Score”
([assessment page](https://capriniriskscore.org/assessment-for-healthcare-professionals/),
[rights footer](https://capriniriskscore.org/resources/); read 2026-10-20).
The 2019 completion article is CC BY-NC 4.0, which covers that article, not
the instrument, its forms or its translations. No instrument-level licence,
permission statement or redistribution grant was located. **Instrument
permission is unverified and blocks distribution.** Do not copy the score
sheet, questionnaire graphics or translations under Apache-2.0.

**6. Implementation risk.** High. Many subjective and historical items;
overlapping surgery/mobility categories; separate prior VTE events; version
drift; specialty-specific cut-offs; missing history that must not become zero;
and a risk category that drives prophylaxis. The existing assessment already
records an incomplete item oracle and unresolved exactly-45-minute and

> 120-minute rules.

**7. MDR intended-purpose note.** Patient-specific VTE risk that informs
prophylaxis is likely medical-device software, with a class IIa starting
hypothesis and IIb possible if the decision impact is high. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md), “Later renal
estimates and scores”. A non-device educational version would need a
separately bounded purpose that matches the delivered function.

**8. Fit for InterMED.** **Medium.** It is the most clinically requested
surgical score, but rights, version semantics and the incomplete item oracle
make it a poor first implementation. Defer until a named reviewer approves one
version and the rightsholder position is recorded.

---

## 2. qSOFA

**1. Purpose and population.** A three-variable bedside flag for adults with
suspected infection, particularly outside the ICU, identifying those at higher
risk of death or prolonged ICU stay. It does not diagnose or exclude sepsis.
Paediatric and pregnancy validation is not established.

**2. Primary reference.** Singer M, Deutschman CS, Seymour CW, et al. The third
international consensus definitions for sepsis and septic shock (Sepsis-3).
_JAMA._ 2016;315(8):801–810.
[DOI 10.1001/jama.2016.0287](https://doi.org/10.1001/jama.2016.0287),
[PMID 26903338](https://pubmed.ncbi.nlm.nih.gov/26903338/). Seymour CW, Liu VX,
Iwashyna TJ, et al. Assessment of clinical criteria for sepsis. _JAMA._
2016;315(8):762–774.
[DOI 10.1001/jama.2016.0288](https://doi.org/10.1001/jama.2016.0288),
[PMID 26903335](https://pubmed.ncbi.nlm.nih.gov/26903335/). qSOFA derivation
and the ≥2 threshold are in the latter; the consensus definition is in the
former.

Guideline position: the Surviving Sepsis Campaign 2021 makes a **strong
recommendation against** using qSOFA, compared with SIRS, NEWS or MEWS, as a
single screening tool for sepsis or septic shock
([DOI 10.1007/s00134-021-06506-y](https://doi.org/10.1007/s00134-021-06506-y),
[PMID 34599691](https://pubmed.ncbi.nlm.nih.gov/34599691/), open full text;
recommendation 2 and rationale checked). It may still raise concern alongside
other assessment.

**3. Inputs and units.** Respiratory rate (breaths/min), systolic blood
pressure (mmHg), and mentation. The first two are objective; mentation is
observer-assessed. Sepsis-3 operationalises altered mentation as GCS <15,
whereas the derivation used a broader altered-mentation definition. A
calculator must state which definition it uses.

**4. Scoring rules.** One point each for respiratory rate ≥22/min, systolic
BP ≤100 mmHg, and altered mentation; total 0–3; ≥2 is the flag. No rounding.
The boundary values are inclusive.

**5. Rights.** No licence or permission statement was located on the JAMA or
publisher pages. The instrument is widely reproduced, but that is not a
licence. **Rights unverified.**

**6. Implementation risk.** Low computational complexity, but high
interpretation risk: the mentation definition, missing vital signs, and the
temptation to present ≥2 as “sepsis”. The result must be labelled a risk flag
that neither confirms nor excludes sepsis and must not trigger cultures,
antibiotics or admission by itself.

**7. MDR intended-purpose note.** Patient-specific sepsis risk is likely
MDSW; IIa starting hypothesis. A pure educational table would be a different
function, but a calculator that consumes patient values and returns a risk
flag is decision support. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Medium.** Very small scope and a useful surgical
inpatient flag, but the SSC 2021 recommendation limits how it can be
presented. It is implementable only with an explicit “not a screening tool”
limitation and a named reviewer.

---

## 3. SOFA

**1. Purpose and population.** Describes organ dysfunction and failure in
critically ill adults, usually in the ICU. Sepsis-3 uses an acute rise in SOFA
of ≥2 points in suspected infection to define organ dysfunction. It is a
severity description and trend tool, not a treatment algorithm, and not a
stand-alone triage rule. Paediatric and pregnancy validation is not
established here.

**2. Primary reference.** Vincent JL, Moreno R, Takala J, et al. The SOFA
(Sepsis-related Organ Failure Assessment) score to describe organ
dysfunction/failure. _Intensive Care Med._ 1996;22(7):707–710.
[DOI 10.1007/BF01709751](https://doi.org/10.1007/BF01709751),
[PMID 8844239](https://pubmed.ncbi.nlm.nih.gov/8844239/). Original table
cross-checked in the existing assessment against the ESICM-hosted scan.

Update/definition: Singer 2016 and Seymour 2016 (above). Guideline position:
the Surviving Sepsis Campaign 2021 uses SOFA within the Sepsis-3 definition
and for organ-dysfunction assessment, not as a single decision rule.

**3. Inputs and units.** Six systems: PaO2/FiO2 (mmHg with FiO2 as a fraction)
plus respiratory support; platelets (10³/µL); bilirubin (mg/dL); mean arterial
pressure (mmHg) and vasopressor dose (µg/kg/min); Glasgow Coma Scale; and
creatinine (mg/dL) or urine output (mL/day). Respiratory support, vasopressor
use and urine collection are context-dependent, not pure laboratory values.

**4. Scoring rules and version differences.** Each organ scores 0–4; total
0–24; the original specifies daily worst values. The existing assessment
records a derived “highest matching criterion” normalisation, not a quoted
algorithm, and unresolved boundary gaps (for example bilirubin >12.0 vs
≥12.0; creatinine >5.0 vs ≥5.0). Vincent and Singer print different
cardiovascular bands around dopamine 5 µg/kg/min; those versions must not be
merged. Do not copy the table; use a reviewed machine-readable rule set.

**5. Rights.** No licence or permission statement was located on the Springer
or ESICM pages. The score is widely reproduced in guidelines and critical-care
literature, but that is not a redistribution licence. **Rights unverified.**

**6. Implementation risk.** High data burden; missing FiO2 or support status;
sedation confounding GCS; combined pressors; incomplete urine collection;
baseline SOFA often unknown; and the difference between “SOFA now” and “SOFA
change”. Missing components must not be scored as normal. A total without the
component values is not interpretable.

**7. MDR intended-purpose note.** Patient-specific organ-dysfunction
assessment that supports sepsis identification or prognosis is likely MDSW;
IIa starting hypothesis, IIb possible in high-impact ICU decisions. Monitoring
physiological status can engage the higher Rule 11 limb. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Medium.** Clinically central, but heavy, dependent
on ICU data quality and still carries the unresolved boundary and timing
questions. It is a second-wave candidate after GCS and the simpler surgical
scores.

---

## 4. NEWS2

**1. Purpose and population.** A standardised early-warning score for
deterioration in **adults aged 16 or more** in acute care. The RCP report
explicitly says NEWS should not be used in children under 16 or during
pregnancy, because normal physiology and its response to illness differ. It is
a monitoring and escalation aid, not a diagnosis.

**2. Primary reference.** Royal College of Physicians. _National Early Warning
Score (NEWS) 2: standardising the assessment of acute-illness severity in the
NHS. Updated report of a working party._ London: RCP, 2017
([RCP resource page and report](https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/);
report PDF read). The RCP page also hosts the current charts and the copyright
terms.

Validation: Pimentel MAF, Redfern OC, Gerry S, et al. A comparison of the
ability of the National Early Warning Score and the National Early Warning
Score 2 to identify patients at risk of in-hospital mortality: a multi-centre
database study. _Resuscitation._ 2019;134:147–156.
[DOI 10.1016/j.resuscitation.2018.09.026](https://doi.org/10.1016/j.resuscitation.2018.09.026),
[PMID 30287355](https://pubmed.ncbi.nlm.nih.gov/30287355/). Guideline
position: NHS England endorsed NEWS/NEWS2 for adult acute care; the RCP report
is the current source. No NICE guideline specific to NEWS2 was assessed.

**3. Inputs and units.** Respiratory rate (breaths/min), SpO2 (%), use of
supplemental oxygen (yes/no), systolic blood pressure (mmHg), pulse
(beats/min), consciousness using ACVPU (new confusion is the “C”), and
temperature (°C). The SpO2 scale is a clinician decision: Scale 1 normally;
Scale 2 only for hypercapnic respiratory failure with a prescribed target of
88–92%, and the decision must be recorded. Most inputs are objective; new
confusion is observer-assessed.

**4. Scoring rules and version differences.** Each parameter scores 0–3, with
supplemental oxygen adding 2; total 0–20. Response bands: 0 and 1–4 low; a
single parameter score of 3 is a red flag; 5–6 medium; ≥7 high. Scale 1 and
Scale 2 are different scoring tables; the unused scale must be excluded, not
silently defaulted. NEWS2 differs from the original 2012 NEWS by the ACVPU
change, the dedicated Scale 2 section, and the oxygen-delivery section; the
original report is archived and must not be used clinically.

**5. Rights.** The RCP states: “In order to encourage as many people as
possible to use the material there is no copyright restriction on NEWS2. You
are therefore free to reproduce material, as long as you meet the following
conditions” — acknowledge the RCP with the specified citation, do not
modify/amend the material, reproduce the charts in colour from the high-quality
downloads, and use the specified disclaimer on translations
([RCP NEWS2 page](https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/),
read 2026-10-20). **Verified.** Whether an interactive software implementation
counts as “material” and whether a re-implemented score table is a
“modification” needs a legal reading before release; the attribution and
no-modification conditions are clear.

**6. Implementation risk.** Scale selection is the main hazard; a default
Scale 1 for a COPD patient changes the score. ACVPU, supplemental oxygen and
missing observations need explicit handling. The score also carries operational
response instructions (monitoring frequency, escalation), which are part of
the RCP report but are clinical policy, not arithmetic. Do not let the app
issue those instructions without local approval.

**7. MDR intended-purpose note.** Aggregating vital signs to monitor
deterioration is likely MDSW. Rule 11 sets IIa for monitoring physiological
processes and **IIb where monitoring vital physiological parameters whose
variation could pose immediate danger**. NEWS2 is close to that IIb fact
pattern. See [REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Low–medium.** Rights are workable, but the
monitoring purpose and likely IIb classification make it the heaviest
regulatory candidate here. It is not a good first M11 addition.

---

## 5. Glasgow Coma Scale

**1. Purpose and population.** Communicates level of consciousness after acute
brain injury and tracks change. It applies to adults and to children over
about 5 years; younger children need a modified verbal response. Sedation,
paralysis, intubation, language barriers, hearing loss and spinal injury can
make components untestable. It is not a prognosis by itself.

**2. Primary reference.** Teasdale G, Jennett B. Assessment of coma and impaired
consciousness: a practical scale. _Lancet._ 1974;2(7872):81–84.
[DOI 10.1016/S0140-6736(74)91639-0](<https://doi.org/10.1016/S0140-6736(74)91639-0>),
[PMID 4136544](https://pubmed.ncbi.nlm.nih.gov/4136544/).

Structured approach/update: Teasdale G, Maas A, Lecky F, Manley G, Stocchetti
N, Murray G. The Glasgow Coma Scale at 40 years: standing the test of time.
_Lancet Neurol._ 2014;13(8):844–854.
[DOI 10.1016/S1474-4422(14)70120-6](<https://doi.org/10.1016/S1474-4422(14)70120-6>),
[PMID 25030516](https://pubmed.ncbi.nlm.nih.gov/25030516/). The operational
“not testable” rules were checked on the official GCS site
([FAQ](https://glasgowcomascale.org/faq/), read 2026-10-20).

Guideline context: the Brain Trauma Foundation severe TBI guideline is the
standard guideline reference for GCS-based severity assessment
([DOI 10.1227/NEU.0000000000001432](https://doi.org/10.1227/NEU.0000000000001432),
[PMID 27654000](https://pubmed.ncbi.nlm.nih.gov/27654000/)); its full text was
not re-read for this assessment, so the exact wording is **unverified**.

**3. Inputs and units.** Three observed components: eye opening (1–4), verbal
response (1–5) and best motor response (1–6). No laboratory units. All three
are observer-dependent; the scale is a structured examination, not a
measurement.

**4. Scoring rules and version differences.** E4 + V5 + M6; summed range 3–15.
The structured approach records the three components and the total. If a
component cannot be tested, record **NT**, never “1”, and **do not report a
total** while any component is NT; the trend in the testable components is
still useful. Intubated or tracheostomised patients commonly have verbal NT
while eye and motor remain testable. The GCS-Pupils score (GCS-P) is a separate
later derivative and is not assessed here; do not add pupils to GCS silently.

**5. Rights.** The official GCS site states that the GCS, GCS Aid, GCS-P,
GCS-P-Age CT prognostic charts and the verbal-score imputation tool “may all be
used for clinical care and clinical research at no cost. No license is
required”, with acknowledgement of the copyright of Glasgow University (GCS)
and Sir Graham Teasdale
([permissions page](https://www.glasgowcomascale.org/permissions/), read
2026-10-20). **Verified for clinical care and clinical research.** Commercial
redistribution and modified derivative charts are not addressed by that
statement; review before bundling charts or translated text.

**6. Implementation risk.** Medium–high. Per-component capture with NT is
mandatory; a single “GCS total” input field encourages the exact error the
official guidance warns against. Sedation/paralysis, paediatric verbal
responses, aphasia and spinal injury need explicit handling. Inter-rater
variability is inherent; training and a consistent technique are part of
valid use.

**7. MDR intended-purpose note.** Recording a clinician’s component scores and
summing them is close to structured documentation. Classifying severity (for
example mild/moderate/severe head injury) or using the score to trigger care is
decision support. A component-only recording mode may sit on the documentation
side; a severity interpretation needs the MDR analysis. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **High.** Free for clinical use with attribution, small
and deterministic, reusable by SOFA/APACHE II/qSOFA, and the NT rules are
explicitly documented. The correct design is component-first, NT-aware, and
refuses to output a total when a component is NT.

---

## 6. Alvarado score, with the AIR score as comparator

**1. Purpose and population.** Risk stratification for adults with suspected
acute appendicitis. Alvarado is a diagnostic aid, not a confirmation rule.
Paediatrics: the WSES 2020 guideline says Alvarado and the Paediatric
Appendicitis Score are useful for **excluding** appendicitis in children but
should not be used alone to diagnose it. Pregnancy: WSES advises against
diagnosing appendicitis on symptoms and signs alone. The AIR score was derived
in adults with suspected appendicitis and includes CRP.

**2. Primary reference.** Alvarado A. A practical score for the early diagnosis
of acute appendicitis. _Ann Emerg Med._ 1986;15(5):557–564.
[DOI 10.1016/S0196-0644(86)80993-3](<https://doi.org/10.1016/S0196-0644(86)80993-3>),
[PMID 3963537](https://pubmed.ncbi.nlm.nih.gov/3963537/).

Comparator: Andersson M, Andersson RE. The appendicitis inflammatory response
score: a tool for the diagnosis of acute appendicitis that outperforms the
Alvarado score. _World J Surg._ 2008;32(8):1843–1849.
[DOI 10.1007/s00268-008-9649-y](https://doi.org/10.1007/s00268-008-9649-y),
[PMID 18553045](https://pubmed.ncbi.nlm.nih.gov/18553045/).

Guideline position: WSES Jerusalem guidelines 2020 recommend clinical scores
to exclude appendicitis and identify intermediate-risk patients who need
imaging (strong, 1A); recommend the AIR and Adult Appendicitis Score as
clinical predictors (strong, 1A); and **suggest against** using Alvarado to
positively confirm appendicitis in adults (weak, 2B)
([DOI 10.1186/s13017-020-00306-3](https://doi.org/10.1186/s13017-020-00306-3),
[PMID 32295644](https://pubmed.ncbi.nlm.nih.gov/32295644/), open full text;
statements 1.2–1.4 checked).

**3. Inputs and units.** Alvarado: migration of pain to the right iliac fossa,
anorexia, nausea/vomiting, right-lower-quadrant tenderness, rebound
tenderness, temperature, white-cell count and left shift. Temperature (°C) and
WBC (10³/µL or 10⁹/L) are objective; pain history and tenderness are
subjective. AIR: vomiting, right-lower-quadrant pain, rebound
tenderness/muscular defence graded light/medium/strong, temperature ≥38.5 °C,
neutrophil percentage, WBC count and CRP (mg/L). AIR is more laboratory-heavy
and less history-dependent.

**4. Scoring rules and version differences.** Alvarado totals 10: two points
each for right-lower-quadrant tenderness and leukocytosis, one point for each
other item. AIR totals 12: vomiting 1, RIF pain 1, rebound/defence 1–3,
temperature 1, neutrophils 1–2, WBC 1–2, CRP 1–2. The commonly quoted Alvarado
bands (for example 1–4, 5–6, 7–8, 9–10) and AIR bands (0–4, 5–8, 9–12) were
**not verified against the original papers**; the WSES text favours AIR over
Alvarado but does not settle the bands in the passages read. Do not copy a
score sheet.

**5. Rights.** No licence or permission statement was located for either
instrument. Both are widely reproduced in journals and calculators, but that
is not a licence. **Rights unverified.**

**6. Implementation risk.** High for Alvarado because of subjective history
and tenderness items; medium for AIR because CRP, neutrophil percentage and
graded defence still need local definitions. Laboratory units and the
temperature boundary (38.5 °C) need explicit rules. The score is an adjunct to
a diagnostic pathway that includes imaging and clinical review; it must not
produce a “rule out” or “operate” instruction.

**7. MDR intended-purpose note.** A patient-specific diagnostic aid for
appendicitis is likely MDSW; IIa starting hypothesis. The WSES “exclude and
triage to imaging” use is more than generic reference content. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Medium–high.** Directly relevant to a surgeon, but
the evidence favours AIR over Alvarado, and Alvarado must carry the WSES
warning against using it to confirm. If the pair is selected, implement AIR as
the primary instrument and Alvarado as a separately labelled comparator, not a
silent substitute.

---

## 7. Glasgow–Blatchford score

**1. Purpose and population.** Pre-endoscopy risk stratification for adults
with acute upper gastrointestinal bleeding. It identifies patients at very low
risk of rebleeding, death or need for hospital-based intervention who may be
managed as outpatients. It is not a post-endoscopy score (Rockall is separate)
and is not validated for children or pregnancy.

**2. Primary reference.** Blatchford O, Murray WR, Blatchford M. A risk score to
predict need for treatment for upper-gastrointestinal haemorrhage. _Lancet._
2000;356(9238):1318–1321.
[DOI 10.1016/S0140-6736(00)02816-6](<https://doi.org/10.1016/S0140-6736(00)02816-6>),
[PMID 11073021](https://pubmed.ncbi.nlm.nih.gov/11073021/).

Guideline position: NICE CG141 says to use the Blatchford score at first
assessment for all patients with acute upper GI bleeding and to consider early
discharge when the pre-endoscopy score is **0**
([CG141 recommendations](https://www.nice.org.uk/guidance/cg141/chapter/Recommendations),
published 2012, updated 2016; checked). ESGE 2021 recommends GBS for
pre-endoscopy risk stratification and states that patients with **GBS ≤1** are
at very low risk and can be managed as outpatients
([DOI 10.1055/a-1369-5274](https://doi.org/10.1055/a-1369-5274),
[PMID 33567467](https://pubmed.ncbi.nlm.nih.gov/33567467/); recommendation 1
checked). The BSG-led multisociety care bundle also uses early risk
stratification
([DOI 10.1136/flgastro-2019-101395](https://doi.org/10.1136/flgastro-2019-101395),
[PMID 32582423](https://pubmed.ncbi.nlm.nih.gov/32582423/)).

**3. Inputs and units.** Urea (mmol/L), haemoglobin (g/dL, with sex-specific
thresholds), systolic blood pressure (mmHg), pulse (beats/min), melena,
syncope, hepatic disease and cardiac failure. Laboratory and vital-sign inputs
are objective; melena, syncope and comorbidity are history/judgement items.

**4. Scoring rules and version differences.** Weighted sum of all eight items,
range 0–23; higher scores indicate higher risk. It is a pre-endoscopy
instrument; the post-endoscopy Rockall score is a separate instrument and must
not be appended to it. Score 0 is low risk in NICE; ESGE uses ≤1. That is a
real guideline-level discrepancy, not a rounding difference: the
implementation must select one authority and display the choice. Component
bands are not reproduced here; the exact urea, haemoglobin, pressure and pulse
intervals must come from a reviewed source table.

**5. Rights.** No licence or permission statement was located. **Rights
unverified.**

**6. Implementation risk.** Medium. Urea versus blood urea nitrogen is the main
unit hazard; haemoglobin thresholds are sex-specific; the 0-versus-≤1
disposition threshold changes who is called low risk; melena and syncope are
subjective; and “early discharge” depends on social and endoscopic capacity,
not the score alone. A total without the input values is not enough.

**7. MDR intended-purpose note.** A patient-specific triage/disposition aid for
acute GI bleeding is likely MDSW; IIa starting hypothesis. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **High.** Small, mostly objective, directly relevant
to surgical/endoscopic practice, and endorsed by NICE and ESGE. The first task
is to choose the 0 or ≤1 threshold with a named reviewer; both must not appear
as if equivalent.

---

## 8. Wells DVT and Wells PE

**1. Purpose and population.** Separate pretest-probability instruments for
adults with suspected deep-vein thrombosis (DVT) and suspected pulmonary
embolism (PE). They sit inside diagnostic pathways with D-dimer and imaging.
They are not stand-alone exclusion rules and are not validated for pregnancy,
children, already-anticoagulated patients or all inpatient populations.

**2. Primary references.** DVT derivation: Wells PS, Anderson DR, Bormanis J,
et al. Value of assessment of pretest probability of deep-vein thrombosis in
clinical management. _Lancet._ 1997;350(9094):1795–1798.
[DOI 10.1016/S0140-6736(97)08140-3](<https://doi.org/10.1016/S0140-6736(97)08140-3>),
[PMID 9428249](https://pubmed.ncbi.nlm.nih.gov/9428249/). DVT validation:
Wells PS, Anderson DR, Rodger M, et al. Evaluation of D-dimer in the diagnosis
of suspected deep-vein thrombosis. _N Engl J Med._ 2003;349(13):1227–1235.
[DOI 10.1056/NEJMoa023153](https://doi.org/10.1056/NEJMoa023153),
[PMID 14507948](https://pubmed.ncbi.nlm.nih.gov/14507948/).

PE derivation: Wells PS, Anderson DR, Rodger M, et al. Derivation of a simple
clinical model to categorize patients probability of pulmonary embolism:
increasing the models utility with the SimpliRED D-dimer. _Thromb Haemost._
2000;83(3):416–420.
[DOI 10.1055/s-0037-1613830](https://doi.org/10.1055/s-0037-1613830),
[PMID 10744147](https://pubmed.ncbi.nlm.nih.gov/10744147/). PE management
validation: Wells PS, Anderson DR, Rodger M, et al. Excluding pulmonary
embolism at the bedside without diagnostic imaging. _Ann Intern Med._
2001;135(2):98–107.
[DOI 10.7326/0003-4819-135-2-200107170-00010](https://doi.org/10.7326/0003-4819-135-2-200107170-00010),
[PMID 11453709](https://pubmed.ncbi.nlm.nih.gov/11453709/).

Guideline position: NICE NG158 recommends the **two-level DVT Wells score**
and reproduces it “adapted with permission from Wells et al. (2003)”; the same
page does not use a PE Wells score, Geneva or PESI
([NG158 recommendations](https://www.nice.org.uk/guidance/ng158/chapter/Recommendations),
published 2020, updated 2023; checked). ESC 2019 places clinical probability
(Wells or revised Geneva), D-dimer and CTPA in the diagnostic algorithm and
uses PESI/sPESI for severity
([DOI 10.1093/eurheartj/ehz405](https://doi.org/10.1093/eurheartj/ehz405),
[PMID 31504429](https://pubmed.ncbi.nlm.nih.gov/31504429/); full-text tables
were not retrieved, so the exact class/table wording is **unverified**).

**3. Inputs and units.** DVT: active cancer, paralysis/paresis/recent plaster,
bed rest ≥3 days or major surgery within 12 weeks, deep-vein tenderness, whole
leg swelling, calf difference ≥3 cm, unilateral pitting oedema, non-varicose
collateral veins, previous DVT, and an alternative diagnosis at least as
likely (−2). PE: clinical signs of DVT, alternative diagnosis less likely,
pulse >100/min, immobilisation >3 days or surgery within 4 weeks, previous
DVT/PE, haemoptysis, and malignancy. Calf measurement is in cm; the ESC
technique is 10 cm below the tibial tuberosity. The alternative-diagnosis item
and tenderness are subjective.

**4. Scoring rules and version differences.** DVT two-level: ≥2 “likely”, ≤1
“unlikely”; range −2 to 9. PE two-level: >4 “likely”, ≤4 “unlikely”; range
0–12.5 with half-points. Original three-level versions and the revised
two-level versions are different instruments; do not mix them or reuse the
same probability labels. DVT uses a 12-week surgical window; PE uses 4 weeks.
Retain half-points; do not round.

**5. Rights.** No licence or permission statement was located. NICE’s
“adapted with permission” note shows that NICE obtained permission; it does
not grant InterMED any right. **Rights unverified.**

**6. Implementation risk.** High. Subjective items, time-window inclusivity,
calf-measurement technique, half-points, and the need to display the
D-dimer/imaging pathway rather than a stand-alone probability. Missing history
must remain unknown. “Wells” alone is not a formula ID.

**7. MDR intended-purpose note.** Patient-specific pretest probability that
drives imaging or anticoagulation decisions is likely MDSW; IIa starting
hypothesis. See [REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Medium.** Postoperative VTE is relevant to a
surgeon, but the value depends on integrating a diagnostic pathway that is
outside the calculator engine. Implement only with a named pathway and a
separate formula ID for DVT and PE.

---

## 9. Revised Geneva score

**1. Purpose and population.** Pretest probability of PE in adults presenting
to the emergency department. It is an alternative to the Wells PE model, not
an add-on. It is not validated for children or pregnancy in the sources read.

**2. Primary reference.** Le Gal G, Righini M, Roy PM, et al. Prediction of
pulmonary embolism in the emergency department: the revised Geneva score.
_Ann Intern Med._ 2006;144(3):165–171.
[DOI 10.7326/0003-4819-144-3-200602070-00004](https://doi.org/10.7326/0003-4819-144-3-200602070-00004),
[PMID 16461960](https://pubmed.ncbi.nlm.nih.gov/16461960/). Guideline position:
ESC 2019 includes the revised Geneva score as an alternative clinical
probability model to Wells
([DOI 10.1093/eurheartj/ehz405](https://doi.org/10.1093/eurheartj/ehz405),
[PMID 31504429](https://pubmed.ncbi.nlm.nih.gov/31504429/)); exact table and
recommendation class **unverified**.

**3. Inputs and units.** Age >65 years; previous DVT/PE; surgery or fracture
within 1 month; active malignancy; unilateral lower-limb pain; haemoptysis;
heart rate 75–94 or ≥95/min; and pain on deep palpation with unilateral leg
oedema. Age, heart rate and the time window are objective; pain and oedema are
examination findings.

**4. Scoring rules and version differences.** Weighted sum, range 0–22.
Three-level version: 0–3 low, 4–10 intermediate, ≥11 high. Two-level version:
≤5 PE unlikely, >5 PE likely. The original Geneva score (2001) is a different
instrument; do not label a revised-Geneva result as “Geneva”. Do not round
heart-rate boundaries.

**5. Rights.** No licence or permission statement was located. **Rights
unverified.**

**6. Implementation risk.** Medium. Heart-rate boundaries, the time window,
the subjective leg findings, and the three-level/two-level choice. The score
must be tied to a D-dimer/imaging pathway and must not be presented as a
stand-alone rule-out.

**7. MDR intended-purpose note.** Patient-specific pretest probability for PE
is likely MDSW; IIa starting hypothesis. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Medium.** A reasonable alternative to Wells PE, but
implementing both would duplicate the same clinical job. Choose one with a
reviewer.

---

## 10. PESI and sPESI

**1. Purpose and population.** Prognostic severity classification in adults
with **confirmed** acute PE, used to support site-of-care and monitoring
decisions. It is not a diagnostic score and must not be applied to suspected
PE before confirmation. It is not validated for children or pregnancy here.

**2. Primary references.** Aujesky D, Obrosky DS, Stone RA, et al. Derivation
and validation of a prognostic model for pulmonary embolism. _Am J Respir Crit
Care Med._ 2005;172(8):1041–1046.
[DOI 10.1164/rccm.200506-862OC](https://doi.org/10.1164/rccm.200506-862OC),
[PMID 16020800](https://pubmed.ncbi.nlm.nih.gov/16020800/). Jiménez D, Aujesky
D, Moores L, et al. Simplification of the pulmonary embolism severity index
for prognostication in patients with acute symptomatic pulmonary embolism.
_Arch Intern Med._ 2010;170(15):1383–1389.
[DOI 10.1001/archinternmed.2010.199](https://doi.org/10.1001/archinternmed.2010.199),
[PMID 20696966](https://pubmed.ncbi.nlm.nih.gov/20696966/). Guideline position:
ESC 2019 uses PESI/sPESI in PE severity assessment and early-discharge
pathways ([DOI 10.1093/eurheartj/ehz405](https://doi.org/10.1093/eurheartj/ehz405),
[PMID 31504429](https://pubmed.ncbi.nlm.nih.gov/31504429/)); exact thresholds
and class **unverified**.

**3. Inputs and units.** PESI: age (years, continuous), male sex, cancer,
chronic heart failure, chronic lung disease, pulse ≥110/min, systolic BP
<100 mmHg, respiratory rate ≥30/min, temperature <36 °C, altered mental
status, and SpO2 <90%. sPESI: age >80, cancer, chronic cardiopulmonary
disease, pulse ≥110, systolic BP <100, and SpO2 <90, each 1 point. Most are
objective; mental status and comorbidity are judgement items.

**4. Scoring rules and version differences.** PESI classes I–V use total-score
bands (≤65, 66–85, 86–105, 106–125, >125); sPESI is 0 versus ≥1. PESI and
sPESI are different instruments with different inputs; a sPESI result must not
be labelled PESI. Age is a continuous PESI input, so the score cannot be
computed from a category.

**5. Rights.** No licence or permission statement was located. **Rights
unverified.**

**6. Implementation risk.** Medium. Age as a continuous variable, missing
vitals, class boundaries, and the risk of implying that a low score authorises
outpatient care. The result needs the confirmed-PE context and the local
pathway.

**7. MDR intended-purpose note.** Patient-specific prognosis and site-of-care
support in confirmed PE is likely MDSW; IIa starting hypothesis. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Medium–low.** Useful in a PE pathway but not a core
surgical tool, and it depends on a confirmed diagnosis and a site-of-care
policy.

---

## 11. Padua prediction score

**1. Purpose and population.** VTE risk assessment in **hospitalised medical
patients**, used to select prophylaxis. It is not a surgical score and should
not be substituted for Caprini in postoperative patients. It is not validated
for children or pregnancy here.

**2. Primary reference.** Barbar S, Noventa F, Rossetto V, et al. A risk
assessment model for the identification of hospitalized medical patients at
risk for venous thromboembolism: the Padua Prediction Score. _J Thromb
Haemost._ 2010;8(11):2450–2457.
[DOI 10.1111/j.1538-7836.2010.04044.x](https://doi.org/10.1111/j.1538-7836.2010.04044.x),
[PMID 20738765](https://pubmed.ncbi.nlm.nih.gov/20738765/). Guideline position:
ASH 2018 discusses Padua and IMPROVE as the most extensively studied medical
inpatient models and states that Padua ≥4 indicates high VTE risk
([DOI 10.1182/bloodadvances.2018022954](https://doi.org/10.1182/bloodadvances.2018022954),
[PMID 30482763](https://pubmed.ncbi.nlm.nih.gov/30482763/), open full text,
Table 1 checked). ACCP/CHEST 2012 recommends risk-stratified prophylaxis in
acutely ill medical patients without naming Padua in the abstract
([DOI 10.1378/chest.11-2296](https://doi.org/10.1378/chest.11-2296),
[PMID 22315261](https://pubmed.ncbi.nlm.nih.gov/22315261/)).

**3. Inputs and units.** Active cancer, previous VTE, reduced mobility,
known thrombophilia, recent trauma/surgery, age, heart/respiratory failure,
acute myocardial infarction or ischaemic stroke, acute infection/rheumatological
disorder, BMI, and ongoing hormonal treatment. Age in years, BMI in kg/m².
Reduced mobility and acute infection are judgement items.

**4. Scoring rules and version differences.** Weighted sum, range 0–20; ≥4
high risk, <4 low risk. The age item is **≥70** in the original description,
whereas the ASH 2018 table prints **>70**; the exactly-70 boundary is a
recorded discrepancy and must be resolved before implementation. Do not copy
the table.

**5. Rights.** No licence or permission statement was located. **Rights
unverified.**

**6. Implementation risk.** Medium. Wrong-population use is the main hazard.
Reduced-mobility definitions, acute infection, the age boundary and missing
items need explicit rules. It must not be presented as a surgical alternative
to Caprini.

**7. MDR intended-purpose note.** Patient-specific VTE risk and prophylaxis
support in medical inpatients is likely MDSW; IIa starting hypothesis. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Low.** It is a medical-inpatient instrument; the
owner is a surgeon and the product already has Caprini as the surgical
candidate. Including Padua would add a second VTE model with a different
population and no surgical role.

---

## 12. CURB-65

**1. Purpose and population.** Mortality-risk stratification and disposition
support in adults with community-acquired pneumonia. It is not for
hospital-acquired pneumonia, and it is not validated for children or
pregnancy. Clinical judgement and social factors remain part of disposition.

**2. Primary reference.** Lim WS, van der Eerden MM, Laing R, et al. Defining
community acquired pneumonia severity on presentation to hospital: an
international derivation and validation study. _Thorax._ 2003;58(5):377–382.
[DOI 10.1136/thorax.58.5.377](https://doi.org/10.1136/thorax.58.5.377),
[PMID 12728155](https://pubmed.ncbi.nlm.nih.gov/12728155/). Guideline position:
BTS 2009 recommends CURB-65 for severity assessment
([DOI 10.1136/thx.2009.121434](https://doi.org/10.1136/thx.2009.121434),
[PMID 19783532](https://pubmed.ncbi.nlm.nih.gov/19783532/)). NICE NG250 (2025)
tells clinicians to use CURB65 with clinical judgement to classify adults with
CAP as low, intermediate or high risk
([NG250 recommendations](https://www.nice.org.uk/guidance/ng250/chapter/Recommendations),
published 2025; box 2 checked).

**3. Inputs and units.** Confusion (abbreviated Mental Test score ≤8 or new
disorientation), urea (NICE prints “blood urea nitrogen over 7 mmol/L” — see
the unit warning below), respiratory rate ≥30/min, systolic BP <90 mmHg or
diastolic BP ≤60 mmHg, and age ≥65 years. Four items are objective; confusion
is observer-assessed.

**4. Scoring rules and version differences.** One point per item; total 0–5.
Common bands: 0–1 low risk, 2 moderate, ≥3 severe. CRB-65 omits urea for
primary care; it is a different instrument, not a missing-value version of
CURB-65. Do not round the age or pressure boundaries.

**5. Rights.** No licence or permission statement was located. **Rights
unverified.**

**6. Implementation risk.** Medium. The NICE box labels the urea item as
“blood urea nitrogen (over 7 mmol/litre)”; 7 mmol/L is a **urea** threshold,
not a BUN threshold. Implementing that label literally as BUN would be a
ten-fold unit error. Confusion definitions, the age-65 boundary and
disposition context need review. The score is not a stand-alone admission
rule.

**7. MDR intended-purpose note.** Patient-specific mortality risk and
disposition support in CAP is likely MDSW; IIa starting hypothesis. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Low–medium.** Simple and well known, but it is a
respiratory/medical score rather than a surgical one. It would be a reasonable
later addition, not a first-wave choice for this owner.

---

## 13. APACHE II

**1. Purpose and population.** Severity-of-disease classification and
group-level outcome comparison for adult ICU patients, using the worst values
in the first 24 hours after ICU admission. It is not a treatment algorithm and
not a stand-alone individual prognosis. APACHE IV is a later, separately
licensed system; APACHE II must not be presented as current APACHE.

**2. Primary reference.** Knaus WA, Draper EA, Wagner DP, Zimmerman JE. APACHE
II: a severity of disease classification system. _Crit Care Med._
1985;13(10):818–829.
[DOI 10.1097/00003246-198510000-00009](https://doi.org/10.1097/00003246-198510000-00009),
[PMID 3928249](https://pubmed.ncbi.nlm.nih.gov/3928249/). No current guideline
endorsement of APACHE II as an individual decision tool was located; it is a
research/benchmarking descriptor.

**3. Inputs and units.** Twelve physiologic variables (temperature, mean
arterial pressure, heart rate, respiratory rate, oxygenation, arterial pH,
sodium, potassium, creatinine, haematocrit, white-cell count, GCS), plus age
and chronic health status. FiO2 and PaO2 units, creatinine units and GCS
handling are all implementation-critical. Most inputs are objective; chronic
health and the acute physiology values require review.

**4. Scoring rules and version differences.** Weighted points, total 0–71. The
published mortality estimate is not the score alone: it uses a logistic
equation with diagnostic-category coefficients and an emergency-surgery term.
Those coefficients are part of the paper and must be transcribed by a reviewer,
not reconstructed from memory. Missing variables and the “normal” baseline
convention need an explicit rule. APACHE II, APACHE III and APACHE IV are
different systems.

**5. Rights.** The original article is a Wolters Kluwer/Crit Care Med
publication. APACHE is a US trademark (USPTO serial 74068190; the mirror
record shows a 2024 cancellation entry that was not confirmed on the official
register — **unverified**). No permission or licence statement for reproducing
the score was located. **Rights unverified.**

**6. Implementation risk.** High. Twelve variables, a 24-hour worst-value
window, GCS/sedation, missing data, diagnostic coefficients and the difference
between score and predicted mortality. The data burden is much larger than any
other candidate here.

**7. MDR intended-purpose note.** Patient-specific ICU severity or mortality
prediction is likely MDSW; IIa starting hypothesis, IIb possible where the
decision impact is high. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Low.** Heavy, rights-unclear and superseded by
APACHE IV in practice. It is not a sensible first M11 calculator.

---

## 14. ASA physical status classification

**1. Purpose and population.** A pre-anaesthesia communication system for a
patient’s comorbid status, assigned by an anaesthetist or clinician. It covers
adults, children and obstetric patients through examples; it is a
classification, not a score, and it does not by itself predict perioperative
risk.

**2. Primary reference.** American Society of Anesthesiologists. ASA Physical
Status Classification System. Developed by the Committee on Economics; last
amended 13 December 2020 (original approval 15 October 2014)
([ASA statement](https://www.asahq.org/standards-and-practice-parameters/statement-on-asa-physical-status-classification-system);
page bot-blocked on 2026-10-20, read via the
[2025-12-05 Wayback snapshot](https://web.archive.org/web/20251205202555/https://www.asahq.org/standards-and-practice-parameters/statement-on-asa-physical-status-classification-system)).
The 1963 origin citation was not verified with a DOI or PMID; **unverified**.
Guideline context: ERAS 2018 uses ASA 2–5 as a marker of higher hypothermia
risk and notes that preoperative risk scores have limited evidence
([DOI 10.1007/s00268-018-4844-y](https://doi.org/10.1007/s00268-018-4844-y),
[PMID 30426190](https://pubmed.ncbi.nlm.nih.gov/30426190/), full text checked).

**3. Inputs and units.** No numeric inputs or units. The input is a clinician’s
judgement, supported by examples (healthy; mild systemic disease; severe
systemic disease; constant threat to life; moribund; brain-dead organ donor)
and, since 2020, paediatric and obstetric examples. The “E” suffix denotes
emergency surgery. High subjectivity.

**4. Scoring rules and version differences.** Categories I–VI, plus E. There
is no sum and no arithmetic. The 2020 amendment added examples; older
statements and locally invented subclasses are different content. Do not
convert the class to a number or average classes.

**5. Rights.** The ASA page states: “© 2025 American Society of
Anesthesiologists. All Rights Reserved. Content may not be copied, modified,
distributed, reproduced, or used with artificial intelligence or in similar
technologies for any purposes without ASA’s prior consent” (Wayback snapshot
of the official page, read 2026-10-20). **Verified.** InterMED cannot reproduce
the categories, examples or table without ASA’s prior consent. The present
document therefore summarises the concept and does not reproduce the ASA text.

**6. Implementation risk.** High subjectivity and inter-rater variability; the
examples are part of the instrument and are themselves restricted; a
classification is easy to mistake for a risk score. Any suggestion of a class
by the software converts a clinician’s judgement into decision support.

**7. MDR intended-purpose note.** A tool that simply records the class the
clinician assigned is closer to documentation. A tool that suggests a class
from comorbidity examples, or uses the class to estimate risk, is decision
support and likely MDSW. See
[REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **Low.** The rights position is an explicit
prohibition, and the instrument is a subjective classification rather than a
calculator. Do not implement without ASA permission and a clear
documentation-only purpose.

---

## 15. RCRI (Lee revised cardiac risk index)

**1. Purpose and population.** Preoperative cardiac risk assessment for adults
undergoing major noncardiac surgery. It estimates 30-day major cardiac events
and supports a stepwise perioperative pathway. It is not a stand-alone
clearance rule and does not replace clinical assessment or functional-capacity
testing. Paediatric and pregnancy validation is not established here.

**2. Primary reference.** Lee TH, Marcantonio ER, Mangione CM, et al.
Derivation and prospective validation of a simple index for prediction of
cardiac risk of major noncardiac surgery. _Circulation._
1999;100(10):1043–1049.
[DOI 10.1161/01.CIR.100.10.1043](https://doi.org/10.1161/01.CIR.100.10.1043),
[PMID 10477528](https://pubmed.ncbi.nlm.nih.gov/10477528/).

Guideline position: ESC 2022
([DOI 10.1093/eurheartj/ehac270](https://doi.org/10.1093/eurheartj/ehac270),
[PMID 36017553](https://pubmed.ncbi.nlm.nih.gov/36017553/)) and ACC/AHA 2024
([DOI 10.1161/CIR.0000000000001285](https://doi.org/10.1161/CIR.0000000000001285),
[PMID 39316661](https://pubmed.ncbi.nlm.nih.gov/39316661/)) are the current
perioperative cardiovascular guidelines; the RCRI is the index commonly used
in that pathway, but the exact recommendation wording and class/LOE were not
retrieved because the publisher pages blocked automated access —
**class/LOE unverified**. ERAS
2018 notes that preoperative risk scores exist but have limited evidence for
guiding care
([DOI 10.1007/s00268-018-4844-y](https://doi.org/10.1007/s00268-018-4844-y),
[PMID 30426190](https://pubmed.ncbi.nlm.nih.gov/30426190/), checked).

**3. Inputs and units.** Six binary predictors: high-risk surgery
(intraperitoneal, intrathoracic or suprainguinal vascular), history of
ischaemic heart disease, history of heart failure, history of cerebrovascular
disease, insulin-treated diabetes, and creatinine >2.0 mg/dL (≈176.8 µmol/L).
Surgery type and comorbidities are clinician-assessed; creatinine is
objective.

**4. Scoring rules and version differences.** One point per predictor; total
0–6. The derivation reported 30-day major cardiac event rates by score (0, 1,
2, ≥3); those rates are cohort-specific and must be displayed with their
source, not as a universal probability. There is no separate “RCRI 2”; local
adaptations and the “revised cardiac risk index” name should be versioned
explicitly.

**5. Rights.** No licence or permission statement was located on the AHA or
publisher pages. The index is widely reproduced, but that is not a licence.
**Rights unverified.**

**6. Implementation risk.** Medium. The “high-risk surgery” definition is a
judgement item; creatinine units and the 2.0 mg/dL boundary are error-prone;
the event-rate table needs a source and a date; missing comorbidity history
must remain unknown. The output must not order tests or delay surgery by
itself.

**7. MDR intended-purpose note.** Patient-specific perioperative cardiac risk
that informs testing or surgery planning is likely MDSW; IIa starting
hypothesis. See [REGULATORY_ASSESSMENT_MDR](../REGULATORY_ASSESSMENT_MDR.md).

**8. Fit for InterMED.** **High.** Small, mostly objective, directly relevant
to a surgeon, and the most practical index in the current perioperative
guideline context. It has the best ratio of clinical value to implementation
cost in this list.

---

## Ranked recommendation: first 3–5 to implement

The ranking is a research proposal for the owner, not an approval. It weighs
surgical relevance, source certainty, rights, data burden, subjectivity and
MDR exposure. All five still require a named clinical reviewer, a rights
record and approved test cases.

| Rank | Candidate                                         | Why first                                                                                                                                          | Gate before implementation                                                                                                           |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | RCRI (Lee)                                        | Directly preoperative; six mostly objective items; aligned with current ESC 2022 and ACC/AHA 2024 perioperative guidance; small arithmetic surface | Record the exact guideline class/LOE; approve the event-rate presentation and creatinine boundary; rights record                     |
| 2    | Glasgow Coma Scale (structured, NT-aware)         | Free for clinical use with attribution; foundational for SOFA/APACHE II/qSOFA; explicit NT rules prevent a known safety error                      | Component-first UI; refuse totals when NT; paediatric verbal scope; chart/translation rights only if charts are bundled              |
| 3    | Glasgow–Blatchford                                | Acute UGIB is core surgical/endoscopic work; mostly objective; NICE and ESGE endorsed                                                              | Choose 0 (NICE) or ≤1 (ESGE) as the low-risk threshold; resolve urea units and sex-specific haemoglobin                              |
| 4    | AIR score, with Alvarado as a labelled comparator | WSES 2020 recommends AIR/AAS and advises against Alvarado for confirmation in adults; AIR is more laboratory-based and less history-dependent      | Verify AIR risk bands from the primary source; keep Alvarado’s “not for confirmation” warning; define CRP/neutrophil units           |
| 5    | qSOFA                                             | Three inputs; useful as a surgical inpatient risk flag; quick to build                                                                             | Encode the SSC 2021 “not a single screening tool” limitation; choose the mentation definition; no sepsis verdict or automatic action |

**Why Caprini is not in the first five.** It has the highest clinical demand,
but the instrument-level rights position is unresolved, the 2005 and 2013
versions have different items, the risk bands are specialty-specific, and a
complete machine-ready item oracle is still missing. It should be the first
candidate in the **second** wave, once a reviewer and the rightsholder position
are recorded.

**Why NEWS2 is not in the first five.** The RCP rights terms are workable, but
NEWS2 is a monitoring tool and sits closest to the MDR Rule 11 IIb fact
pattern. It also carries operational escalation instructions that are local
policy, not arithmetic. It needs a regulatory decision before engineering.

**Why SOFA and APACHE II are not in the first five.** Both are heavy ICU data
instruments with missing-data and support-status problems. APACHE II also has
unclear rights and a mortality equation that needs diagnostic coefficients.

**Why ASA-PS is not in the first five.** The ASA explicitly prohibits copying
and distribution without prior consent, and the instrument is a subjective
classification rather than a score.

## What this document does not decide

- It does not approve, rank for release or authorise implementation of any
  candidate.
- It does not establish Romanian applicability, local epidemiology, assay
  compatibility or a clinical pathway.
- It does not grant any rights. No instrument-specific licence is recorded;
  “widely published” is not a licence.
- It does not replace the M11 per-component approval model, the MDR
  qualification/classification decision or the clinical-safety file.
- It does not select the owner’s shortlist. **The owner selects.** Nothing
  here is clinically approved.

## Verification log and open items

**Verified on 2026-10-20.** All DOIs listed above resolved through the DOI
resolver and matched their PubMed/Europe PMC records. PMIDs were taken from
those records. The RCP NEWS2 copyright page, the GCS permissions page, the ASA
statement (via the official-page snapshot), the NICE recommendation pages, the
ESGE/WSES/ASH/SSC open full texts and the Caprini site copyright notice were
read directly.

**Unverified and blocking.**

1. Caprini instrument-level licence/permission; complete 2005/2013 item
   inventory, double-counting rules and specialty risk bands.
2. ASA 1963 origin citation (no DOI/PMID located); ASA permission for any
   reproduction.
3. Exact ESC 2022 and ACC/AHA 2024 recommendation class/LOE for the RCRI; the
   publisher pages blocked automated access.
4. ESC 2019 PE table wording and exact PESI/sPESI thresholds; full text not
   retrieved.
5. Alvarado and AIR risk-band provenance from the original papers.
6. Glasgow–Blatchford exact component intervals (the summary uses the standard
   description; the intervals were not re-read from the 2000 paper).
7. APACHE II diagnostic coefficients and the exact missing-data convention.
8. Padua age boundary: original ≥70 versus ASH 2018 table >70.
9. Whether an interactive NEWS2 implementation is a “modification” or
   “material” under the RCP terms; legal reading required.
10. GCS commercial/redistribution scope beyond clinical care and clinical
    research.
