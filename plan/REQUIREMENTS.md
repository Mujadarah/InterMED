# InterMED requirements

## Status and reading rules

These are intended requirements, not implemented capabilities. MVP means the Romanian medication-reference and structured interaction PWA; calculators follow shortly afterward. Appwrite infrastructure starts in MVP; accounts and patient cases do not.

Numbering is continuous. [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) maps all 300 original IDs, including platform adaptations and later clinical scope. The maintainer explicitly retired ten native-only requirements on 2026-10-01; their original IDs remain documented in the traceability record, not active requirements. No non-native clinical requirement was discarded. Later sections are expressly deferred, not an expansion of the medication MVP.

[CLINICAL_SAFETY.md](CLINICAL_SAFETY.md) is mandatory. [CODEX_BUILD_PLAN.md](CODEX_BUILD_PLAN.md) defines sequential gates; a reference/interaction clinical release requires milestone-12 hardening applicable to milestones 1–10, licensed sources and intended-use review. Milestone 11 then extends calculators and milestone 12 repeats/completes hardening.

## Platform and PWA

Scope: MVP, milestones 1–2.

1. The canonical first-party client shall be a responsive installable PWA built with React, TypeScript and Vite; Next.js shall not be required without an architectural decision.
2. The PWA shall target iPhone/iPad Safari, Android and Windows/macOS/Linux browsers in installed and tab modes; platform limitations shall be documented.
3. The application shall be PWA-only; no native application, native build or App Store submission is planned.
4. The application shall provide manifest.webmanifest, scoped start URL, standalone display, installable metadata, normal/maskable icons and HTTPS service-worker registration.
5. The service worker shall cache a versioned application shell, provide offline startup/fallback and expose safe update/reload handling.
6. Layouts shall support phone touch targets, iPhone safe areas, tablet and desktop navigation, keyboard use and accessible error/status presentation.
7. Installation help shall explain Safari Share → Add to Home Screen and browser-specific desktop/Android installation without promising identical prompts.
8. React Router, TanStack Query, Dexie, Zod and React Hook Form are preferred supporting tools; optional Tailwind and service-worker tooling shall be selected through explicit implementation decisions.
9. The app shall support normal keyboard text input.

## Appwrite infrastructure

Scope: MVP, milestone 3.

10. Appwrite Cloud shall provide Sites, Functions, normalized database services and Storage from the initial infrastructure phase, preferably Frankfurt/EU.
11. Sites shall deploy reviewed GitHub revisions with explicit branch/root/install/build/output/domain/environment configuration and tested SPA deep links.
12. Preview/development infrastructure shall be separated from production privileges and data.
13. Public reference access shall not require an account or an anonymous authentication session; approved public-read resources shall grant no public writes.
14. Importer/admin functions, raw snapshots, quarantine, private logs and API keys shall not be publicly readable/executable.
15. The final Appwrite database product, physical schema, indexes, limits, backup/restore and publication transaction model shall be decided and recorded before implementation.
16. Server credentials shall never enter frontend bundles; browser endpoint/project identifiers shall be treated as public.
17. Realtime shall be introduced only for a demonstrated need, not as a mandatory dependency for dataset updates.
18. The MVP shall use Appwrite Cloud infrastructure while preserving local use of downloaded data and requiring no end-user account.
19. Appwrite Cloud shall be initial backend infrastructure behind replaceable adapters; Auth and patient hosting remain separately gated.
20. Backend/auth logic shall be isolated behind interfaces so Appwrite is not embedded throughout the app.

## Romanian medication catalogue

Scope: MVP, milestones 4–5.

21. ANMDMR Nomenclator shall be the canonical initial Romanian catalogue strategy, subject to verified retrieval/transformation/storage/redistribution rights.
22. The project shall not copy or scrape Mediately proprietary data.
23. MedicationProduct, ActiveIngredient and MedicationIngredient shall be separate normalized entities; combination products shall retain all confirmed components.
24. The catalogue shall preserve CIM/source identifiers, commercial/DCI names, authorization information, manufacturer and authorization holder separately where supplied.
25. Ingredient canonicalization, salts/forms and product-to-ingredient crosswalks shall be reviewed/versioned; ambiguous mappings shall remain unresolved.
26. ATCCode, DosageForm, Manufacturer, MarketingAuthorizationHolder, RegulatoryDocument, DataSource and DatasetVersion shall have explicit models.
27. Importer validation shall detect malformed schemas/rows, encoding errors, missing identifiers/ingredients, duplicates, conflicting values and unexpected source layouts.
28. Normalization shall preserve original source text/units while building Romanian diacritic/case-aware indexes; it shall not invent missing fields.
29. Importer retries shall be idempotent; raw source snapshots and validation records shall be private and stored only when permitted.
30. Content approval shall include clinical/data reviewer, provenance and license scope before publication.
31. A medication record shall include active ingredient(s), strength, pharmaceutical form and route where available.
32. The app shall support ATC classification when available.
33. Medication sources shall be abstracted behind stable protocols/interfaces.

## Medication search

Scope: MVP, milestone 7.

34. Search shall run locally against IndexedDB indexes when a compatible catalogue exists, without a network request for each keystroke.
35. Search shall support full/partial commercial name, DCI/ingredient, available ATC and manufacturer; original display names shall be preserved.
36. Safe typo-tolerant ranking may offer candidates but shall not silently select/substitute a product or ingredient.
37. Results shall distinguish strength, formulation and source/product status; no catalogue shall be presented as complete when missing or partially downloaded.
38. The app shall provide medication search by commercial name.
39. The app shall provide medication search by active ingredient.
40. The app should support search by drug class and indication where the data source permits.
41. The app shall support general drug lookup outside of a patient case.

## Medication details and regulatory references

Scope: MVP, milestone 7.

42. Details shall show available identification, concentration/strength, form, route, CIM, ATC, manufacturer, holder and authorization information.
43. Validated permitted clinical fields may include indications, dosing, administration, contraindications, precautions, adverse effects, pregnancy/lactation and renal/hepatic considerations.
44. RCP/SmPC/prospect/PIL shall link to authoritative product-specific documents with provenance; caching/excerpts/body distribution require separate permission.
45. Missing information shall be explicitly unavailable, not generated by AI and labeled official; uncached online links shall show offline limitations.
46. The app should display relevant SmPC/reference information from licensed/permitted sources.
47. The app should support pregnancy/lactation information from a validated source.
48. The app may show validated usual dosing information from an appropriate source.
49. Dose/frequency information must be traceable to a validated source.

## Structured drug interactions

Scope: MVP, milestones 9–10.

50. Commercial selections shall resolve to confirmed canonical ingredients and combination products shall expand before evaluation.
51. Direct ingredient input shall be supported; ambiguous/unmapped input shall require correction or visible incomplete coverage.
52. The checker shall evaluate unordered unique ingredient pairs, preserve product-component mappings, and distinguish duplicate exposure from self-interaction.
53. DrugInteractionProvider shall remain vendor-neutral and expose provider/version, evaluated coverage, unresolved inputs and unavailable/error states.
54. Source vocabulary shall be preserved; normalized severity requires an explicit versioned clinically reviewed mapping with unknown/unmapped states.
55. DrugInteraction and InteractionEvidence shall retain source references, effect, mechanism, evidence, management, monitoring and alternatives only when supplied.
56. No record shall mean at most no reported interaction within evaluated source coverage, never a guarantee of safety.
57. Offline checking shall use only licensed downloaded records; an online-only provider shall show unavailability offline.
58. Provider selection shall assess clinical quality, coverage, freshness, evidence and online/offline/commercial/redistribution restrictions before clinical release.
59. Source disagreement, missing clinical fields, stale versions and omitted pairs shall not be concealed.
60. The app shall support multi-drug interaction checking.
61. The app shall grade interaction severity when supported by its source.
62. The app shall explain interaction mechanism and clinical consequences when supported by its source.
63. The app shall show the provenance/source of interaction information.
64. The app may surface management considerations or alternatives when supported by a validated source.
65. Interaction sources shall be abstracted behind stable protocols/interfaces.

## Offline local storage

Scope: MVP, milestones 2 and 6.

66. Local reference search/details, favorites/recent and licensed downloaded interactions shall work after a successful compatible shell/data download.
67. First-ever offline use shall show download-required/unavailable status instead of implying an empty complete catalogue.
68. The application shall acknowledge quota, eviction, private-mode and installed-versus-tab storage differences; persistent-storage requests are best effort.
69. Storage failures and missing datasets shall have explicit recovery paths; permanent retention and built-in IndexedDB encryption shall not be claimed.
70. Application-shell and clinical-dataset versions shall be separate with tested compatibility; SW activation shall not interrupt unfinished work.
71. Privileged/authenticated resources, secrets and future patient records shall not enter a broad service-worker cache.
72. Local dataset reads shall pin one generation across a search/detail/interaction evaluation.
73. The MVP shall keep downloaded reference datasets, favorites and recent searches locally in IndexedDB through Dexie.
74. The MVP shall not require a user account.
75. Core functions shall remain usable offline.
76. Reference datasets and later clinical storage shall use explicit independently versioned schemas.
77. Database migrations shall be supported from the first release.
78. The app shall provide delete-all-local-data controls.

## Dataset synchronization and integrity

Scope: MVP, milestones 5–6.

79. Startup shall use the local database immediately, then check a small version manifest in the background with timeout/backoff.
80. DatasetVersion shall track source/upstream version/date, import/publication date, schema/client compatibility, checksum, counts, coverage and approval status.
81. Downloads shall be validated/staged outside network-spanning transactions, then activated by a short atomic IndexedDB pointer switch.
82. A failed/interrupted/malformed/incompatible/quota-limited update shall preserve the previous usable generation; active data shall never be cleared to make room.
83. Additions, changes, renames and removals shall be detected against a complete accepted source snapshot; partial/empty/large-drop inputs shall block destructive publication pending review.
84. Published generations shall be immutable, with rollback and safe old-reader retention/garbage collection; multitab upgrades and concurrent writers shall be tested.
85. Full snapshots shall precede optional deltas; delta base/checksum/deletion semantics shall be validated before use.
86. Visible states shall include never downloaded, current/stale, update available, downloading, validating, failed with old data retained, incompatible and storage unavailable.
87. Medication database versions shall be traceable.
88. Database migrations shall be tested across app versions.
89. The app shall include an internal diagnostics screen for app/database/knowledge-base versions and sync state.

## Favorites and recent searches

Scope: MVP, milestone 8.

90. Favorites and recent medication searches shall remain local and useful without an account.
91. Favorites shall use stable product identifiers and show removed/unresolved status after catalogue changes; no silent medication remapping is allowed.
92. Favorites/recent shall be retained independently from dataset replacement and supported schema migrations.
93. Clear/delete/export and documented retention controls shall be provided; browser deletion/eviction risks shall be disclosed.
94. Cross-device favorites/preferences synchronization shall be later opt-in account functionality, not an MVP identity requirement.

## Clinical calculators

Scope: Shortly after the medication/interaction core, milestone 11.

95. Calculator selection shall consider BSA and Cockcroft-Gault alongside the retained candidate list; no candidate is approved merely by being listed.
96. Each released formula shall name its primary source, version, units, population limits, reviewer and boundary/missing-data tests.
97. Formula changes shall be explicit/versioned; renal estimates shall not be presented as a complete dosing decision.
98. Initial calculator inputs shall be ephemeral and not a patient record; auto-population awaits the later patient workspace.
99. The app shall provide a modular clinical-calculator framework.
100. Initial calculators may include BMI.
101. Initial calculators may include eGFR and/or creatinine-clearance tools.
102. Initial calculators may include corrected calcium and sodium corrections where appropriate.
103. Initial surgical calculators may include Caprini VTE risk.
104. Additional calculators may include SOFA/qSOFA, MELD/Child-Pugh, Wells, Glasgow-Blatchford, Ranson/BISAP and others as clinically appropriate.
105. Calculator formulas and versions shall be documented and tested.
106. Every calculator shall have formula tests and boundary cases.

## Safety, provenance and content governance

Scope: Mandatory across all phases.

107. An LLM shall never be primary authority for deciding whether a drug interaction exists.
108. Contraindications, renal/hepatic adjustments, pregnancy/lactation and regulatory content shall be traceable to approved sources; AI shall not fabricate missing official information.
109. Explanations shall not silently alter structured clinical meaning, severity, dose, management or uncertainty.
110. Medication details and checker results shall expose source/document/reference, version/age, retrieval/import date and evidence level where supplied.
111. Intended use, clinical risk and applicable regulatory obligations shall be assessed before public clinical reference/interaction release and revisited for calculators/patient recommendations.
112. The app must never let an LLM invent a medication dose.
113. High-risk safety alerts shall not depend solely on LLM output.
114. Medication dosing shall not be generated from model memory alone.
115. The app shall indicate uncertainty when source data are incomplete or conflicting.
116. Every high-impact deterministic clinical rule shall have automated tests.
117. Clinical content changes shall require review metadata and versioning.
118. The app shall preserve enough provenance to explain how important outputs were produced.
119. The app shall not claim functionality that has not been validated to the level appropriate for its intended use.
120. The project shall prioritize transparency, traceability and clinical usefulness over feature count.
121. The architecture shall be designed as a long-lived extensible platform rather than a disposable prototype.

## Security and privacy

Scope: MVP security; stronger later patient-data gate.

122. The medication MVP shall collect no patient cases/identifiers and require no identity for lookup.
123. Medication searches shall not be attached to identity or sensitive analytics; telemetry, if introduced, shall be privacy-preserving and explicitly reviewed.
124. HTTPS, reviewed CSP/security headers, input validation and untrusted-content sanitization shall be required.
125. Functions shall enforce least privilege, authorization, bounded inputs, rate limits and safe logs; server scoped keys shall not be mistaken for row-level authorization.
126. Effective Appwrite resource permissions shall be tested, including additive table/row grants and public-read/no-write behavior.
127. Dependency pinning/lockfiles, supply-chain scanning and secret scanning shall be part of CI before deployment.
128. Before future patient data storage/upload, approve encryption/key management, hosting/compliance, retention/deletion/export, access controls, incident response and operational ownership.
129. The app shall minimize collection of directly identifying patient data.
130. The app shall avoid placing patient data in analytics events.
131. The app shall avoid placing patient data in ordinary crash logs.
132. The app shall clearly show where data are currently stored.
133. The app shall provide clear export/delete controls.
134. Technical logs shall avoid protected patient data.

## Architecture and platform longevity

Scope: Mandatory boundaries, later modules gated.

135. Domain packages shall not import React, Appwrite SDK or browser persistence types; adapters shall translate transport/vendor objects.
136. Contributor builds/tests shall run with synthetic mock providers and no proprietary dataset or cloud credentials.
137. The app shall use a clean modular architecture.
138. UI/presentation shall be separated from clinical/domain logic.
139. Clinical/domain logic shall be separated from persistence.
140. Clinical/domain logic shall be separated from network providers.
141. Clinical rules shall not be hard-coded into React views or other presentation components.
142. Storage shall be abstracted behind stable protocols/interfaces.
143. AI providers shall be abstracted behind stable protocols/interfaces.
144. Guideline/evidence sources shall be abstracted behind stable protocols/interfaces.
145. The architecture shall support replacing providers without rewriting the domain layer.
146. Clinical-rule packages shall have independent versions.
147. Evidence packages shall have independent versions.
148. Clinically meaningful outputs shall record the versions used to generate them when practical.
149. Feature flags shall be supported for major future modules.
150. Specialty modules shall be independently extensible.
151. Standard terminologies such as ATC, ICD, LOINC, UCUM and SNOMED CT may be mapped where legally/licensably appropriate.
152. InterMED shall remain usable as a standalone local medication reference and later local clinical workspace without hospital integration.
153. InterMED shall not require connection to a hospital system.
154. The initial open-source client shall not require an end-user subscription; Appwrite hosting and permitted dataset licenses have separately budgeted operator costs.

## Later patient/case management

Scope: Phase 5.

155. The app shall create a new local patient/case without requiring an account.
156. The app shall generate a unique internal case ID automatically.
157. Patient name shall be optional.
158. Patient surname shall be optional.
159. Age/date of birth shall be optional.
160. National/personal identity number shall be optional.
161. Hospital medical-file number shall be optional and have a dedicated field.
162. Hospital admission number shall be optional and have a dedicated field.
163. Ward and bed shall be optional.
164. A clinician-defined alias/nickname shall be optional.
165. The app shall remain fully usable when all personal identity fields are empty.
166. The app shall support case search by local case ID, name, hospital file number, admission number or alias when those values exist.
167. The app shall support archiving a case.
168. The app shall support deleting a case.
169. The app shall show a patient/case timeline.

## Later clinical input and OCR

Scope: Phases 5 and 7.

170. The app shall support natural-language free-text clinical input.
171. The app shall support structured forms for important clinical fields.
172. The app shall support camera photo input.
173. The app shall support selecting an existing image from the photo library/files picker.
174. The app shall extract text from photos using OCR.
175. The app shall allow photographing a blood-pressure monitor and extracting BP/pulse values where readable.
176. The app shall allow photographing laboratory results.
177. The app shall allow photographing medication packaging or ampoules.
178. The app shall allow photographing medication charts/prescriptions.
179. The app shall allow photographing radiology reports.
180. The app shall allow photographing pathology reports.
181. The app shall allow photographing consultation/discharge/operative notes.
182. The app shall preserve the original typed or extracted note when useful for provenance.
183. The app shall convert accepted free text or OCR output into structured clinical data where possible.
184. The app shall show an extraction review screen before clinical data are accepted.
185. The user shall be able to correct extracted values before confirmation.
186. The app shall never silently add OCR-derived medication, lab or vital values without user confirmation.

## Later symptoms and first presentation

Scope: Phases 5 and 8.

187. The user shall be able to type a patient's presenting symptoms in ordinary language.
188. The user shall be able to add symptom onset, duration, severity and relevant associated symptoms when known.
189. The user shall be able to enter clinical examination findings.
190. The app shall identify relevant missing information needed to evaluate the presentation.
191. The app shall surface relevant differential considerations when supported by its clinical knowledge base.
192. The app shall suggest guideline-supported investigation categories or next evaluation steps.
193. Every significant suggestion shall explain why it is relevant.

## Later diagnoses and conditions

Scope: Phases 5 and 8.

194. The user shall be able to enter or select one or more diagnoses.
195. The app shall support ICD-10 lookup where licensing/data access permits.
196. The app shall associate diagnoses with the patient timeline.
197. The app shall identify guideline pathways relevant to a selected diagnosis.
198. The app shall support recording comorbidities.
199. The app shall support recording allergies and adverse drug reactions.

## Later surgery and procedures

Scope: Phases 5, 8 and 11+.

200. The user shall be able to record an intended or completed procedure.
201. Procedure data shall include procedure type, date and time when available.
202. Procedure data shall support elective/emergency status.
203. Procedure data shall support open/laparoscopic/robotic/endoscopic or other relevant approaches.
204. Procedure data shall support anastomosis presence/type where relevant.
205. Procedure data shall support stoma information where relevant.
206. Procedure data shall support drain/device information where relevant.
207. The app shall automatically calculate postoperative day from the operation date.
208. The app shall associate procedure-specific risks and pathways with the case.
209. When surgery is being considered, the app may surface guideline-supported surgical options and prerequisites.
210. The app shall show why a particular surgical pathway is relevant.
211. The app shall surface situations where guideline pathways call for staging, optimization, biopsy, MDT review or neoadjuvant treatment before surgery.
212. The app shall not silently declare a single surgical option to be universally correct when evidence supports multiple reasonable options.

## Later oncology

Scope: Phase 11+.

213. The app shall support recording tumor organ/site.
214. The app shall support recording pathology/histology.
215. The app shall support recording grade where applicable.
216. The app shall support recording TNM/stage where applicable.
217. The app shall support recording metastatic disease status.
218. The app shall support recording relevant biomarkers where applicable.
219. The app shall use the recorded oncology context to retrieve applicable evidence/guideline pathways.
220. The app may surface evidence-backed sequencing options such as surgery-first, neoadjuvant treatment, additional staging or MDT review.
221. Oncology outputs shall include guideline/source and version/date.

## Later vitals and longitudinal observations

Scope: Phases 5–6.

222. The app shall support blood pressure.
223. The app shall support heart rate.
224. The app shall support temperature.
225. The app shall support respiratory rate.
226. The app shall support SpO2.
227. The app shall support MAP where available or calculable.
228. The app shall support urine output.
229. The app shall store observations with timestamps.
230. The app shall preserve historical observations rather than overwriting them.
231. The app shall visualize trends over time.
232. The app shall identify clinically meaningful changes using validated rules.
233. A newly entered abnormal value shall be interpreted in the context of previous values and the clinical state.

## Later laboratory data and trends

Scope: Phases 6–7.

234. The app shall support manual entry of laboratory values.
235. The app shall support OCR extraction of laboratory values from a photo.
236. Every lab value shall store test type, value, unit and timestamp/date when available.
237. The app shall support hemoglobin/hematocrit.
238. The app shall support WBC/neutrophils/platelets.
239. The app shall support CRP and procalcitonin.
240. The app shall support creatinine and urea.
241. The app shall support sodium, potassium, chloride, calcium and magnesium.
242. The app shall support AST, ALT, ALP, GGT and bilirubin.
243. The app shall support INR, aPTT and fibrinogen.
244. The app shall support lactate.
245. The app shall support amylase/lipase.
246. The app shall support procedure-specific values such as drain amylase or drain bilirubin.
247. The app shall normalize supported laboratory units internally.
248. The app shall calculate absolute and percentage change where clinically meaningful.
249. The app shall support baseline, current value, peak, nadir and trend/slope concepts.
250. The app shall visualize laboratory trends.
251. Clinically meaningful trend rules shall be deterministic/versioned where used for alerts.

## Later findings, devices and microbiology

Scope: Phases 5–6.

252. The app shall support abdominal pain, distension, vomiting and bowel-function observations.
253. The app shall support wound findings.
254. The app shall support drain output quantity and character.
255. The app shall support NG-tube output where relevant.
256. The app shall support fluid balance where relevant.
257. The app shall support important devices such as central lines, urinary catheters and drains.
258. The app shall support microbiology cultures and susceptibilities.

## Later imaging/report capture

Scope: Phases 5, 7 and 9.

259. The user shall be able to manually enter important imaging findings.
260. The user shall be able to paste a radiology report.
261. The user shall be able to photograph a radiology report.
262. AI/OCR may extract structured findings from a report.
263. Extracted findings shall require clinician confirmation.
264. No release shall claim autonomous interpretation of raw CT/MRI/ultrasound images without a separately approved specification and validation; it is excluded from the medication MVP.

## Later patient medication safety and extended interactions

Scope: Phases 4–5 and later clinically reviewed extensions.

265. The app shall support adding medications to a patient's active medication list.
266. Medication entries shall support dose, route, frequency, start date and stop date when known.
267. The app shall support photographing/scanning a medication and proposing a match.
268. The app shall require confirmation of scanned medication identification.
269. The interaction checker should include drug-food/herbal/supplement interactions when a reliable licensed source is available.
270. The app shall check relevant renal-function restrictions when supported by its drug source.
271. The app shall check relevant hepatic-function restrictions when supported by its drug source.
272. The app shall check for therapeutic duplication where supported by its drug taxonomy.
273. The app shall check the proposed medication against recorded allergies.

## Later patient-specific dosing and antimicrobial support

Scope: Phases 5, 8 and 11+.

274. The app should account for renal function when a validated dosing source supports adjustment.
275. The app should account for hepatic function when a validated dosing source supports adjustment.
276. The app may support pediatric/geriatric dosing in later releases when suitable validated sources are available.
277. The app shall distinguish surgical antibiotic prophylaxis from therapeutic antibiotic treatment.
278. The app may surface whether prophylaxis is generally indicated for a procedure when supported by a guideline.
279. The app may surface recommended prophylactic agent classes, timing, redosing and duration when supported by validated guidance.
280. The app may surface guidance against unnecessary postoperative continuation of prophylactic antibiotics.
281. Therapeutic antimicrobial support shall consider diagnosis, microbiology, allergies, renal/hepatic function and current medication where data exist.
282. Local antimicrobial-resistance policies shall only be used if explicitly configured in the future; they shall not be assumed.

## Later clinical pathways and next considerations

Scope: Phase 8.

283. The app shall maintain a structured clinical state for each case.
284. The app shall identify applicable clinical pathways from that state.
285. Initial pathways should include postoperative infection/intra-abdominal infection.
286. Initial pathways should include anastomotic leak considerations.
287. Initial pathways should include postoperative bleeding.
288. Initial pathways should include acute kidney injury.
289. Initial pathways should include postoperative ileus.
290. Initial pathways should include VTE risk/prophylaxis considerations.
291. Initial pathways should include sepsis/organ dysfunction considerations.
292. Initial pathways should include bile leak.
293. Initial pathways should include postoperative pancreatic fistula.
294. Procedure-specific pathways shall differ by operation type.
295. The app shall analyze combinations of findings rather than only isolated values.
296. The app shall provide a "What should I consider next?" action for a patient case.
297. The response should be organized as immediate priorities, missing information, investigations, treatment considerations, monitoring and escalation criteria where applicable.
298. The app shall identify clinically important missing data.
299. The app shall expose a "Why am I seeing this?" explanation for clinically meaningful outputs.
300. Explanations shall identify the patient facts/rules that triggered the output.
301. The clinician shall be able to dismiss/mark a pathway as currently not applicable and optionally record a reason.
302. The app shall avoid alerting on every abnormal value and prioritize clinically meaningful signals.

## Later guideline/evidence library

Scope: Phase 8.

303. The app shall maintain a versioned evidence library.
304. Evidence records shall store title, organization/source, publication date, version and link/identifier when available.
305. Clinical recommendations shall reference their source.
306. The app shall show recommendation strength/evidence certainty when provided by the original source.
307. The app shall support multiple guideline organizations.
308. The app shall show when reputable sources disagree rather than hiding disagreement.
309. The app shall allow guideline/evidence search outside of a patient case.
310. The app shall track a review/last-checked date for clinical content.
311. The app shall be able to mark evidence as outdated/superseded.
312. The app shall not redistribute copyrighted guideline content beyond permitted use.

## Later patient calculator integration

Scope: Phases 5–6.

313. Calculators should auto-populate from patient data when possible.

## Later daily review and reconciliation

Scope: Phases 5–6 and 8.

314. The app shall show changes in the previous 24 hours when enough data are available.
315. The app shall identify new, improved, worsened and unchanged clinically relevant values/findings.
316. The app shall support concise daily patient summaries.
317. The app shall support medication reconciliation.
318. The app should help review whether a medication still has a documented indication.
319. The app should support ICU-to-ward medication review/de-escalation considerations based on current indications and evidence.

## Later AI assistance

Scope: Phase 9, safety constraints apply now.

320. AI may interpret natural-language input.
321. AI may structure free text and OCR output.
322. AI may summarize patient changes.
323. AI may explain deterministic rule outputs.
324. AI may retrieve and summarize approved evidence sources.
325. Surgical indications shall not be generated from model memory alone.
326. Every clinically meaningful AI answer should include supporting evidence/provenance where available.
327. User confirmation shall be required for extracted clinical facts before they affect the structured case.

## Later patient storage and upgrades

Scope: Phase 5.

328. Existing patient records shall survive supported app upgrades.
329. Before future patient data are stored locally, the project shall approve a browser-appropriate encryption/key-management and recovery strategy; IndexedDB alone shall not be described as encrypted.

## Later optional synchronization

Scope: Phases 4–5.

330. Later optional user-data synchronization shall show sync status and last-sync information.
331. Later optional user-data synchronization shall retain an available local cached copy while temporarily offline.
332. Sync conflicts shall not silently overwrite newer clinical information.
333. The user shall be able to disable later optional user-data synchronization without losing the currently available local copy.

## Later external backup and portability

Scope: Phase 10.

334. The architecture shall support future Google Drive backup/sync integration.
335. The architecture shall support future Microsoft OneDrive backup/sync integration.
336. The architecture shall support future Dropbox backup/sync integration.
337. Third-party storage providers shall be implemented as adapters/plugins.
338. Cloud backup shall be conceptually separate from real-time sync.
339. The user should eventually be able to choose local-only storage or an approved Appwrite/external provider.
340. Future health-data backups shall use approved encryption before leaving the device, with explicit key-management/recovery design.
341. The app shall support a versioned portable backup/export format.
342. The app shall support import/restore of its own backup format.
343. The app shall support export of an individual case.
344. The app shall support migration between storage providers in a future release.

## Later session locking and privacy controls

Scope: Phases 4–5.

345. Future patient-workspace UI may support an optional application-specific PIN/password/session lock, with a documented browser threat model.
346. App locking shall not be mandatory.
347. The user shall be able to enable or disable app locking later.
348. The user shall be able to configure automatic lock behavior.
349. Future patient-workspace UI may support lock-on-background within tested browser capabilities.
350. Future patient-workspace UI should obscure sensitive previews where the platform permits; browser/PWA app-switcher redaction shall not be guaranteed.
351. The app should provide a manual Lock Now action.
352. Future local patient-data encryption/key management shall remain independent from optional UI lock settings.

## Later patient identity and cloud AI privacy

Scope: Phases 5 and 9.

353. No personal identity field shall be mandatory for clinical use.
354. Raw identifiable patient data shall not be sent to a general cloud LLM by default.
355. Any future cloud AI processing shall require explicit architectural/privacy review and user/organization configuration.

## Later interoperability

Scope: Phase 11+.

356. The core clinical state model shall be FHIR-aware without requiring FHIR integration in the MVP.

## Later optional accounts and patient backend

Scope: Phases 4–5.

357. Account creation shall not be part of the medication MVP; backend infrastructure shall not imply account creation.
358. Later optional accounts shall preserve a useful local-only mode without mandatory identity.
359. Future accounts may support email/password or passwordless authentication if desired.
360. Future accounts may support Sign in with Apple.
361. Future accounts may support Google Sign-In.
362. Account creation shall explain the value offered, such as cross-platform sync, shared settings or cloud backup.
363. The app should preserve a local-only mode even after accounts exist, if technically and commercially feasible.
364. Account deletion and data deletion flows shall be designed before public account launch.
365. Server-side patient data shall not be introduced until security, privacy, compliance, hosting cost and operational responsibilities are explicitly addressed.

## Later clinical quality and operational maturity

Scope: Relevant clinical/backup phase gates.

366. OCR extraction shall be tested against representative documents/images.
367. Storage-provider adapters shall have integration tests before release.
368. The project shall maintain synthetic clinical cases for regression testing.
369. Tests shall include incomplete and contradictory clinical data.
370. Tests shall include false-positive/alert-fatigue scenarios.
371. A safe backup/restore path shall exist before the app is considered mature for prolonged real-world use.

## Later clinical product positioning

Scope: Patient workspace.

372. The later patient-workspace user experience shall be: enter what you know → confirm the data → see what changed → see what matters → see applicable pathways → see evidence-backed next considerations.
