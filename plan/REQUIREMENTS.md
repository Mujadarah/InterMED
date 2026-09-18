# ClinPath Final Requirements

## Patient and case management

1. The app shall create a new local patient/case without requiring an account.
2. The app shall generate a unique internal case ID automatically.
3. Patient name shall be optional.
4. Patient surname shall be optional.
5. Age/date of birth shall be optional.
6. National/personal identity number shall be optional.
7. Hospital medical-file number shall be optional and have a dedicated field.
8. Hospital admission number shall be optional and have a dedicated field.
9. Ward and bed shall be optional.
10. A clinician-defined alias/nickname shall be optional.
11. The app shall remain fully usable when all personal identity fields are empty.
12. The app shall support case search by local case ID, name, hospital file number, admission number or alias when those values exist.
13. The app shall support archiving a case.
14. The app shall support deleting a case.
15. The app shall show a patient/case timeline.

## Input

16. The app shall support normal keyboard text input.
17. The app shall support natural-language free-text clinical input.
18. The app shall support structured forms for important clinical fields.
19. The app shall support camera photo input.
20. The app shall support selecting an existing image from the photo library/files picker.
21. The app shall extract text from photos using OCR.
22. The app shall allow photographing a blood-pressure monitor and extracting BP/pulse values where readable.
23. The app shall allow photographing laboratory results.
24. The app shall allow photographing medication packaging or ampoules.
25. The app shall allow photographing medication charts/prescriptions.
26. The app shall allow photographing radiology reports.
27. The app shall allow photographing pathology reports.
28. The app shall allow photographing consultation/discharge/operative notes.
29. The app shall preserve the original typed or extracted note when useful for provenance.
30. The app shall convert accepted free text or OCR output into structured clinical data where possible.
31. The app shall show an extraction review screen before clinical data are accepted.
32. The user shall be able to correct extracted values before confirmation.
33. The app shall never silently add OCR-derived medication, lab or vital values without user confirmation.

## First presentation and symptoms

34. The user shall be able to type a patient's presenting symptoms in ordinary language.
35. The user shall be able to add symptom onset, duration, severity and relevant associated symptoms when known.
36. The user shall be able to enter clinical examination findings.
37. The app shall identify relevant missing information needed to evaluate the presentation.
38. The app shall surface relevant differential considerations when supported by its clinical knowledge base.
39. The app shall suggest guideline-supported investigation categories or next evaluation steps.
40. Every significant suggestion shall explain why it is relevant.

## Diagnosis and conditions

41. The user shall be able to enter or select one or more diagnoses.
42. The app shall support ICD-10 lookup where licensing/data access permits.
43. The app shall associate diagnoses with the patient timeline.
44. The app shall identify guideline pathways relevant to a selected diagnosis.
45. The app shall support recording comorbidities.
46. The app shall support recording allergies and adverse drug reactions.

## Surgery and procedures

47. The user shall be able to record an intended or completed procedure.
48. Procedure data shall include procedure type, date and time when available.
49. Procedure data shall support elective/emergency status.
50. Procedure data shall support open/laparoscopic/robotic/endoscopic or other relevant approaches.
51. Procedure data shall support anastomosis presence/type where relevant.
52. Procedure data shall support stoma information where relevant.
53. Procedure data shall support drain/device information where relevant.
54. The app shall automatically calculate postoperative day from the operation date.
55. The app shall associate procedure-specific risks and pathways with the case.
56. When surgery is being considered, the app may surface guideline-supported surgical options and prerequisites.
57. The app shall show why a particular surgical pathway is relevant.
58. The app shall surface situations where guideline pathways call for staging, optimization, biopsy, MDT review or neoadjuvant treatment before surgery.
59. The app shall not silently declare a single surgical option to be universally correct when evidence supports multiple reasonable options.

## Oncology

60. The app shall support recording tumor organ/site.
61. The app shall support recording pathology/histology.
62. The app shall support recording grade where applicable.
63. The app shall support recording TNM/stage where applicable.
64. The app shall support recording metastatic disease status.
65. The app shall support recording relevant biomarkers where applicable.
66. The app shall use the recorded oncology context to retrieve applicable evidence/guideline pathways.
67. The app may surface evidence-backed sequencing options such as surgery-first, neoadjuvant treatment, additional staging or MDT review.
68. Oncology outputs shall include guideline/source and version/date.

## Vital signs and observations

69. The app shall support blood pressure.
70. The app shall support heart rate.
71. The app shall support temperature.
72. The app shall support respiratory rate.
73. The app shall support SpO2.
74. The app shall support MAP where available or calculable.
75. The app shall support urine output.
76. The app shall store observations with timestamps.
77. The app shall preserve historical observations rather than overwriting them.
78. The app shall visualize trends over time.
79. The app shall identify clinically meaningful changes using validated rules.
80. A newly entered abnormal value shall be interpreted in the context of previous values and the clinical state.

## Laboratory data

81. The app shall support manual entry of laboratory values.
82. The app shall support OCR extraction of laboratory values from a photo.
83. Every lab value shall store test type, value, unit and timestamp/date when available.
84. The app shall support hemoglobin/hematocrit.
85. The app shall support WBC/neutrophils/platelets.
86. The app shall support CRP and procalcitonin.
87. The app shall support creatinine and urea.
88. The app shall support sodium, potassium, chloride, calcium and magnesium.
89. The app shall support AST, ALT, ALP, GGT and bilirubin.
90. The app shall support INR, aPTT and fibrinogen.
91. The app shall support lactate.
92. The app shall support amylase/lipase.
93. The app shall support procedure-specific values such as drain amylase or drain bilirubin.
94. The app shall normalize supported laboratory units internally.
95. The app shall calculate absolute and percentage change where clinically meaningful.
96. The app shall support baseline, current value, peak, nadir and trend/slope concepts.
97. The app shall visualize laboratory trends.
98. Clinically meaningful trend rules shall be deterministic/versioned where used for alerts.

## Clinical findings, devices and outputs

99. The app shall support abdominal pain, distension, vomiting and bowel-function observations.
100. The app shall support wound findings.
101. The app shall support drain output quantity and character.
102. The app shall support NG-tube output where relevant.
103. The app shall support fluid balance where relevant.
104. The app shall support important devices such as central lines, urinary catheters and drains.
105. The app shall support microbiology cultures and susceptibilities.

## Imaging and reports

106. The user shall be able to manually enter important imaging findings.
107. The user shall be able to paste a radiology report.
108. The user shall be able to photograph a radiology report.
109. AI/OCR may extract structured findings from a report.
110. Extracted findings shall require clinician confirmation.
111. MVP shall not claim autonomous interpretation of raw CT/MRI/ultrasound images.

## Medication reference and Mediately-like functionality

112. The app shall provide medication search by commercial name.
113. The app shall provide medication search by active ingredient.
114. The app should support search by drug class and indication where the data source permits.
115. A medication record shall include active ingredient(s), strength, pharmaceutical form and route where available.
116. The app should display relevant SmPC/reference information from licensed/permitted sources.
117. The app shall support adding medications to a patient's active medication list.
118. Medication entries shall support dose, route, frequency, start date and stop date when known.
119. The app shall support photographing/scanning a medication and proposing a match.
120. The app shall require confirmation of scanned medication identification.
121. The app shall support multi-drug interaction checking.
122. The interaction checker should include drug-food/herbal/supplement interactions when a reliable licensed source is available.
123. The app shall grade interaction severity when supported by its source.
124. The app shall explain interaction mechanism and clinical consequences when supported by its source.
125. The app shall show the provenance/source of interaction information.
126. The app may surface management considerations or alternatives when supported by a validated source.
127. The app shall check relevant renal-function restrictions when supported by its drug source.
128. The app shall check relevant hepatic-function restrictions when supported by its drug source.
129. The app should support pregnancy/lactation information from a validated source.
130. The app shall check for therapeutic duplication where supported by its drug taxonomy.
131. The app shall check the proposed medication against recorded allergies.
132. The app shall support general drug lookup outside of a patient case.
133. The app shall support ATC classification when available.

## Dosing and treatment support

134. The app may show validated usual dosing information from an appropriate source.
135. Dose/frequency information must be traceable to a validated source.
136. The app must never let an LLM invent a medication dose.
137. The app should account for renal function when a validated dosing source supports adjustment.
138. The app should account for hepatic function when a validated dosing source supports adjustment.
139. The app may support pediatric/geriatric dosing in later releases when suitable validated sources are available.
140. The app shall distinguish surgical antibiotic prophylaxis from therapeutic antibiotic treatment.
141. The app may surface whether prophylaxis is generally indicated for a procedure when supported by a guideline.
142. The app may surface recommended prophylactic agent classes, timing, redosing and duration when supported by validated guidance.
143. The app may surface guidance against unnecessary postoperative continuation of prophylactic antibiotics.
144. Therapeutic antimicrobial support shall consider diagnosis, microbiology, allergies, renal/hepatic function and current medication where data exist.
145. Local antimicrobial-resistance policies shall only be used if explicitly configured in the future; they shall not be assumed.

## Clinical pathways and next-step assistance

146. The app shall maintain a structured clinical state for each case.
147. The app shall identify applicable clinical pathways from that state.
148. Initial pathways should include postoperative infection/intra-abdominal infection.
149. Initial pathways should include anastomotic leak considerations.
150. Initial pathways should include postoperative bleeding.
151. Initial pathways should include acute kidney injury.
152. Initial pathways should include postoperative ileus.
153. Initial pathways should include VTE risk/prophylaxis considerations.
154. Initial pathways should include sepsis/organ dysfunction considerations.
155. Initial pathways should include bile leak.
156. Initial pathways should include postoperative pancreatic fistula.
157. Procedure-specific pathways shall differ by operation type.
158. The app shall analyze combinations of findings rather than only isolated values.
159. The app shall provide a "What should I consider next?" action for a patient case.
160. The response should be organized as immediate priorities, missing information, investigations, treatment considerations, monitoring and escalation criteria where applicable.
161. The app shall identify clinically important missing data.
162. The app shall expose a "Why am I seeing this?" explanation for clinically meaningful outputs.
163. Explanations shall identify the patient facts/rules that triggered the output.
164. The clinician shall be able to dismiss/mark a pathway as currently not applicable and optionally record a reason.
165. The app shall avoid alerting on every abnormal value and prioritize clinically meaningful signals.

## Guidelines and evidence

166. The app shall maintain a versioned evidence library.
167. Evidence records shall store title, organization/source, publication date, version and link/identifier when available.
168. Clinical recommendations shall reference their source.
169. The app shall show recommendation strength/evidence certainty when provided by the original source.
170. The app shall support multiple guideline organizations.
171. The app shall show when reputable sources disagree rather than hiding disagreement.
172. The app shall allow guideline/evidence search outside of a patient case.
173. The app shall track a review/last-checked date for clinical content.
174. The app shall be able to mark evidence as outdated/superseded.
175. The app shall not redistribute copyrighted guideline content beyond permitted use.

## Calculators

176. The app shall provide a modular clinical-calculator framework.
177. Initial calculators may include BMI.
178. Initial calculators may include eGFR and/or creatinine-clearance tools.
179. Initial calculators may include corrected calcium and sodium corrections where appropriate.
180. Initial surgical calculators may include Caprini VTE risk.
181. Additional calculators may include SOFA/qSOFA, MELD/Child-Pugh, Wells, Glasgow-Blatchford, Ranson/BISAP and others as clinically appropriate.
182. Calculators should auto-populate from patient data when possible.
183. Calculator formulas and versions shall be documented and tested.

## Daily review and longitudinal care

184. The app shall show changes in the previous 24 hours when enough data are available.
185. The app shall identify new, improved, worsened and unchanged clinically relevant values/findings.
186. The app shall support concise daily patient summaries.
187. The app shall support medication reconciliation.
188. The app should help review whether a medication still has a documented indication.
189. The app should support ICU-to-ward medication review/de-escalation considerations based on current indications and evidence.

## AI behavior

190. AI may interpret natural-language input.
191. AI may structure free text and OCR output.
192. AI may summarize patient changes.
193. AI may explain deterministic rule outputs.
194. AI may retrieve and summarize approved evidence sources.
195. High-risk safety alerts shall not depend solely on LLM output.
196. Medication dosing shall not be generated from model memory alone.
197. Surgical indications shall not be generated from model memory alone.
198. Every clinically meaningful AI answer should include supporting evidence/provenance where available.
199. The app shall indicate uncertainty when source data are incomplete or conflicting.
200. User confirmation shall be required for extracted clinical facts before they affect the structured case.

## Local-first storage

201. The MVP shall store data locally on the device.
202. The MVP shall not require a hosted backend.
203. The MVP shall not require a user account.
204. Core functions shall remain usable offline.
205. Clinical storage shall use an explicit versioned schema.
206. Database migrations shall be supported from the first release.
207. Existing patient records shall survive supported app upgrades.
208. The local database shall be encrypted at rest using an appropriate iOS strategy.
209. Sensitive keys/secrets shall use Keychain/Secure Enclave facilities where appropriate.
210. The app shall provide delete-all-local-data controls.

## iCloud

211. The app shall support optional iCloud/CloudKit storage/synchronization.
212. iCloud shall not be required to use ClinPath.
213. iCloud sync shall be opt-in.
214. The app shall show sync status and last-sync information.
215. The app shall continue to expose a local cached copy when temporarily offline.
216. Sync conflicts shall not silently overwrite newer clinical information.
217. The architecture shall isolate iCloud behind a storage/sync provider interface.
218. The user shall be able to disable iCloud sync without losing the currently available local copy.

## Future storage providers

219. The architecture shall support future Google Drive backup/sync integration.
220. The architecture shall support future Microsoft OneDrive backup/sync integration.
221. The architecture shall support future Dropbox backup/sync integration.
222. Third-party storage providers shall be implemented as adapters/plugins.
223. Cloud backup shall be conceptually separate from real-time sync.
224. The user should eventually be able to choose local only, iCloud or an external provider.
225. Exported cloud backups should be encrypted before leaving the device when feasible.
226. The app shall support a versioned portable backup/export format.
227. The app shall support import/restore of its own backup format.
228. The app shall support export of an individual case.
229. The app shall support migration between storage providers in a future release.

## App lock and privacy controls

230. The app shall support optional Face ID app locking.
231. The app shall support optional Touch ID where available.
232. The app shall support an optional app-specific PIN/password.
233. App locking shall not be mandatory.
234. The user shall be able to enable or disable app locking later.
235. The user shall be able to configure automatic lock behavior.
236. The app may support lock-on-background.
237. The app should obscure sensitive app-switcher previews when privacy mode is enabled.
238. The app should provide a manual Lock Now action.
239. Local database encryption shall remain independent from optional UI lock settings.
240. Biometrics shall be handled by Apple system APIs; ClinPath shall not store biometric templates.

## Privacy

241. The app shall minimize collection of directly identifying patient data.
242. No personal identity field shall be mandatory for clinical use.
243. The app shall avoid placing patient data in analytics events.
244. The app shall avoid placing patient data in ordinary crash logs.
245. The app shall clearly show where data are currently stored.
246. The app shall provide clear export/delete controls.
247. Raw identifiable patient data shall not be sent to a general cloud LLM by default.
248. Any future cloud AI processing shall require explicit architectural/privacy review and user/organization configuration.

## Architecture and maintainability

249. The app shall use a clean modular architecture.
250. UI/presentation shall be separated from clinical/domain logic.
251. Clinical/domain logic shall be separated from persistence.
252. Clinical/domain logic shall be separated from network providers.
253. Clinical rules shall not be hard-coded into SwiftUI views.
254. Storage shall be abstracted behind stable protocols/interfaces.
255. AI providers shall be abstracted behind stable protocols/interfaces.
256. Medication sources shall be abstracted behind stable protocols/interfaces.
257. Interaction sources shall be abstracted behind stable protocols/interfaces.
258. Guideline/evidence sources shall be abstracted behind stable protocols/interfaces.
259. The architecture shall support replacing providers without rewriting the domain layer.
260. Clinical-rule packages shall have independent versions.
261. Evidence packages shall have independent versions.
262. Medication database versions shall be traceable.
263. Clinically meaningful outputs shall record the versions used to generate them when practical.
264. Feature flags shall be supported for major future modules.
265. Specialty modules shall be independently extensible.
266. The core clinical state model shall be FHIR-aware without requiring FHIR integration in the MVP.
267. Standard terminologies such as ATC, ICD, LOINC, UCUM and SNOMED CT may be mapped where legally/licensably appropriate.

## Future accounts and backend

268. Account creation shall not be part of the MVP.
269. The architecture shall allow accounts to be added later without making them mandatory for local-only users unless product strategy changes.
270. A future backend may use Appwrite or another replaceable provider.
271. Backend/auth logic shall be isolated behind interfaces so Appwrite is not embedded throughout the app.
272. Future accounts may support email/password or passwordless authentication if desired.
273. Future accounts may support Sign in with Apple.
274. Future accounts may support Google Sign-In.
275. If third-party/social login becomes a primary account login on iOS, the login design shall comply with current Apple App Store login-service requirements.
276. Account creation shall explain the value offered, such as cross-platform sync, shared settings or cloud backup.
277. The app should preserve a local-only mode even after accounts exist, if technically and commercially feasible.
278. Account deletion and data deletion flows shall be designed before public account launch.
279. Server-side patient data shall not be introduced until security, privacy, compliance, hosting cost and operational responsibilities are explicitly addressed.

## Quality, safety and testing

280. Every high-impact deterministic clinical rule shall have automated tests.
281. Every calculator shall have formula tests and boundary cases.
282. OCR extraction shall be tested against representative documents/images.
283. Database migrations shall be tested across app versions.
284. iCloud sync shall be tested for offline use, conflicts, interrupted sync and account changes.
285. Storage-provider adapters shall have integration tests before release.
286. The project shall maintain synthetic clinical cases for regression testing.
287. Tests shall include incomplete and contradictory clinical data.
288. Tests shall include false-positive/alert-fatigue scenarios.
289. Clinical content changes shall require review metadata and versioning.
290. The app shall preserve enough provenance to explain how important outputs were produced.
291. Technical logs shall avoid protected patient data.
292. The app shall include an internal diagnostics screen for app/database/knowledge-base versions and sync state.
293. A safe backup/restore path shall exist before the app is considered mature for prolonged real-world use.
294. The app shall not claim functionality that has not been validated to the level appropriate for its intended use.

## Product positioning

295. ClinPath shall remain usable as a standalone local clinical assistant.
296. ClinPath shall not require connection to a hospital system.
297. ClinPath shall not require a subscription or hosted service for the initial open-source build.
298. The core user experience shall be: **enter what you know → confirm the data → see what changed → see what matters → see applicable pathways → see evidence-backed next considerations.**
299. The project shall prioritize transparency, traceability and clinical usefulness over feature count.
300. The architecture shall be designed as a long-lived extensible platform rather than a disposable prototype.
