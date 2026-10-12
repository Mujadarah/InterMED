# Milestone 9 evidence — interaction-provider abstraction (code part)

Date: 2026-10-12. Branch `codex/m9-interaction-provider` at the PR head,
based on `597d1a5`.
Code commits: `52c8f9a` (`feat(domain): add interaction provider contract`),
`8a082fb` (R51 direct ingredient input), `1e95c84`, `92432d2`, `089b22f`
(PR #20 review round 1), `fce93be` (module split), `8afebfa`, `a786550`,
`90523b1`, `62d3f50`, `6fda8a4`, `335ba1d`, `3d6022a`, `533562a`, `ba08cc8`,
`10dc800` (PR #20 review round 2, items 1–11 below).
Scope: vendor-neutral interaction provider contract in the domain package, with synthetic
providers and contract tests. All catalogue and interaction fixtures are synthetic; no real
clinical source was selected or validated in this work.

## 1. Scope and status

Milestone 9 in `plan/CODEX_BUILD_PLAN.md` calls for a vendor-neutral
`DrugInteractionProvider`, a reviewed ingredient crosswalk, structured
`DrugInteraction` / `InteractionEvidence` records, a coverage/outcome contract,
source-specific optional fields and synthetic providers, plus an assessment of the final
source on clinical quality, licence, cost and offline rights.

This evidence covers the code part only:

- `packages/domain/src/interactions/` (new folder; responsibilities split by file:
  `types.ts`, `pairs.ts`, `selection.ts`, `severity.ts`, `evaluate.ts`, `merge.ts`),
  with `packages/domain/src/interactions.ts` kept as a thin re-export barrel.
- Re-exports in `packages/domain/src/index.ts` (unchanged).
- `tests/domain/interactions.test.ts` (47 tests).
- `tests/domain/interaction-provider-contract.ts` (shared suite of 9 assertions).
- `tests/domain/interaction-provider-contract.test.ts` (runs the suite for 7 providers, 63 cases).
- `tests/domain/synthetic-interaction-providers.ts` (fixtures and providers,
  including five adversarial providers and the error/timeout trigger selections).
- Evidence logs in `docs/evidence/milestone-9-2026-10-12/`.

Acceptance from the build plan that is met here: interchangeable adapters pass contracts;
severity, source and evidence vocabulary are preserved; explicit unmapped, incomplete and
unavailable states exist; there is no LLM-generated interaction authority.

What is not claimed: no source is validated. The provider decision stays open; see
`docs/INTERACTION_SOURCE_ASSESSMENT.md`. That assessment path was named in the work brief
but is not present in this worktree at this commit, so there is no approved provider to
cite. Milestone 10 (multi-drug checker UI, licensed caching, clinical dataset validation)
is blocked until the owner approves a provider. The reviewed ingredient crosswalk beyond
the existing confirmed/unresolved join model, persisted downloaded interaction records
(with a Dexie migration), the M10 UI, a clinically reviewed severity mapping and
real-provider validation sets all remain open (see section 8).

Style note: `docs/MILESTONE_8_EVIDENCE.md` named in the brief is not present in this
worktree at this commit; this document follows the factual tone of
`docs/MILESTONE_7_EVIDENCE.md` instead. No marketing language is used.

## 2. Exported API

From `packages/domain/src/index.ts` re-exporting `packages/domain/src/interactions.ts`.
One line per export; wording verified against the source.

Types:

- `CanonicalIngredientPair` — readonly ordered tuple of two active-ingredient ids.
- `DrugInteraction` — source interaction record with optional clinical fields and provenance, including the opt-in `severityMappingReviewed` per-record flag.
- `DrugInteractionProvider` — vendor-neutral contract: `describe()` plus `evaluate(request)`.
- `DuplicateExposure` — one ingredient found in more than one selected product, with a `directInput` flag for direct-plus-product duplication.
- `EvaluatedPairCoverage` — evaluated pair status with provider, source and retrieval metadata.
- `InteractionContext` — required context limitations plus optional values.
- `InteractionDisagreement` — one pair where providers disagree, with reasons and terms.
- `InteractionDisagreementReason` — `severity-terms-differ` or `reported-vs-covered-no-record`.
- `InteractionDisagreementTerm` — one provider's source severity term for a disputed pair.
- `InteractionEvaluation` — full evaluation result with status, records, evidence and provenance, including `directIngredientIds` and the `recordsFromUnavailableProvider` qualifier.
- `InteractionEvaluationOptions` — online flag, context, pair limit, timeout, mapping, clock, timer.
- `InteractionEvaluationStatus` — `reported`, `no-reported-record`, `incomplete` or `unavailable`.
- `InteractionEvidence` — source reference linked to one interaction record.
- `InteractionIncompleteReason` — thirteen codes for why coverage is incomplete (see section 3).
- `InteractionProductIngredientMapping` — one selected product mapped to its ingredient ids.
- `InteractionSelection` — pinned snapshot, selected product ids, dataset version id and optional direct ingredient ids.
- `InteractionSourceVersion` — provider id, source id and source version triple.
- `InteractionTimer` — injected `schedule` / `cancel` used for provider timeouts.
- `InteractionProviderDescriptor` — compatibility alias for `ProviderDescriptor`.
- `NormalizedSeverity` — target type for opt-in severity normalization (`string`).
- `PairCoverageStatus` — `reported`, `covered-no-record`, `not-covered` or `unsupported-context`.
- `ProviderAvailability` — `offline-licensed` or `online-only`.
- `ProviderCapabilities` — list of evaluable context limitations.
- `ProviderDescriptor` — provider id, source id/version, availability, capabilities, rights status.
- `ProviderPairCoverage` — provider-reported coverage for one pair.
- `ProviderRequest` — ingredient ids, pairs, context, dataset version id, online flag and an optional abort signal.
- `ProviderResult` — provider payload: status, pair coverage, records, evidence, retrieval time.
- `ProviderRightsStatus` — `permitted`, `not-permitted` or `unknown`.
- `ProviderStatus` — `available` or `unavailable`.
- `MergedProviderResults` — concatenated records and evidence plus source versions and disagreements.
- `SeverityMapping` — versioned map from source terms to normalized severities, with a reviewed flag.
- `TooManyPairsOutcome` — explicit pair-limit outcome with counts and an empty pair list.
- `UniquePairsComplete` — ready outcome with ingredient count, pair count and pairs.
- `UniquePairsOptions` — optional `maxPairs` for pair generation.
- `UniquePairsResult` — `UniquePairsComplete` or `TooManyPairsOutcome`.
- `UnresolvedInteractionInput` — one product, join or direct ingredient id that could not be resolved, with a reason.
- `UnresolvedInteractionInputReason` — eleven codes for unresolved inputs (see section 3).

Functions:

- `canonicalPair(first, second)` — order two ingredient ids into a canonical pair.
- `uniquePairs(ingredientIds, options?)` — dedupe, sort and expand ids to unordered unique pairs.
- `evaluateInteractions(selection, provider, options)` — resolve products, build pairs and evaluate coverage.
- `mergeProviderResults(providerResults)` — merge at least two provider payloads and flag disagreement.

## 3. Behaviour

All statements below were checked against `packages/domain/src/interactions.ts`.

### Pair canonicalization and `uniquePairs`

- `canonicalPair` orders by `<=`, so `(a, b)` and `(b, a)` produce the same tuple.
- `uniquePairs` dedupes ids with a set, sorts them with string comparison, then emits every
  unordered pair with `firstIndex < secondIndex`; there are no self-pairs.
- For `n` distinct ingredients the pair count is `n(n-1)/2`.
- `maxPairs` must be a non-negative safe integer; anything else throws `RangeError`.
- When `pairCount > maxPairs` the result is `{ status: 'too-many-pairs', ingredientCount,
pairCount, maxPairs, pairs: [] }`: an explicit outcome with an empty pair list, never a
  silently truncated list.

### Duplicate exposure versus self-pairs

- Selection expansion groups resolved ingredients by product; an ingredient present in more
  than one selected product produces a `DuplicateExposure` entry listing those products,
  sorted by ingredient id.
- Pair generation uses the deduped ingredient id set, so duplicate exposure yields one pair
  set over distinct ingredients and never a self-pair.
- A provider record whose canonical pair is a self-pair (`pair[0] === pair[1]`) is rejected
  with the incomplete reason `record-pair-outside-request`; it is not evaluated as a
  self-interaction.

### Combination expansion

- Each selected product is expanded with `expandProductIngredients` against a snapshot pinned
  to the requested dataset version.
- Only components with `mappingStatus === 'confirmed'` and an ingredient state of `present`
  that resolves to a pinned active ingredient are counted.
- The result keeps `selectedProductToIngredientMappings` (one entry per selected product id)
  alongside `evaluatedIngredientIds`, so the product-to-ingredient mapping is preserved for
  explanation. A combination product therefore contributes all of its confirmed ingredients
  and yields one pair per unordered ingredient combination.

### Direct ingredient input

- `InteractionSelection.ingredientIds` is an optional list of directly selected canonical
  ingredient ids. It defaults to empty, so every existing call compiles and behaves unchanged.
- Each direct id is checked against the pinned catalogue snapshot. A known active ingredient
  joins the evaluated set and is listed in the sibling provenance field `directIngredientIds`;
  product origins stay in `selectedProductToIngredientMappings`, so the two fields together
  show the origin of every evaluated ingredient.
- An unknown direct id becomes an `unresolvedInputs` entry with reason `unknown-ingredient`
  carrying the `ingredientId`. It makes the evaluation `incomplete` and is never guessed.
- A direct ingredient also present through a selected product is duplicate exposure: the
  `DuplicateExposure` entry keeps the product ids and sets `directInput: true`. Pair building
  uses the deduped ingredient set, so this never creates a self-pair.
- Pair building, the too-many-pairs limit and status aggregation are unchanged; they now
  operate on the union of product-derived and direct ingredients.

### Reviewed crosswalk

- A product ingredient whose crosswalk has no `reviewed` external mapping (empty,
  `unreviewed` or `rejected`) yields an `unreviewed-ingredient-mapping` unresolved input
  and blocks complete coverage. The ingredient is still paired and sent to the provider so
  any reported record is shown, but `coverageComplete` can never be `true` while the input
  is unresolved.
- A directly selected ingredient follows the same rule: it joins the evaluated set when it
  exists in the pinned snapshot, and an empty or unreviewed crosswalk adds the same
  unresolved reason instead of being silently accepted.
- A snapshot collection containing a non-object (`null`) item yields a `malformed-snapshot`
  unresolved input and an incomplete evaluation; item reads are guarded so evaluation
  resolves instead of throwing.

### Status aggregation rules

Copied faithfully from `evaluateInteractions`:

- `statusUnavailable` is true exactly when the provider payload has `status === 'unavailable'`.
- `unavailableReason` is the payload `reason`, or `provider-unavailable` when absent.
- `coverageComplete` is true exactly when all of these hold: the payload is not unavailable,
  at least one pair was requested, there are no unresolved inputs, the incomplete-reason set
  is empty, evaluated coverage exists for every requested pair, and every coverage entry has
  status `reported` or `covered-no-record`. A `reported` status with an unresolved input
  therefore carries `coverageComplete: false` with a non-empty `incompleteReasons`, and
  `no-reported-record` always carries `coverageComplete: true`.
- The evaluation status is `unavailable` when `statusUnavailable` is true; otherwise
  `reported` when at least one valid record exists; otherwise `no-reported-record` when
  `coverageComplete` is true; otherwise `incomplete`.
- Status stays `reported` when records exist even with partial coverage: a `reported`
  evaluation with an unresolved input or another incomplete reason carries
  `coverageComplete: false` with a non-empty `incompleteReasons`, so the UI must show
  coverage next to the status.
- When the provider reports unavailable, `provider-pair-coverage-incomplete` is added to the
  incomplete reasons even though the status is `unavailable`.

### Incomplete and unavailable reasons

`InteractionIncompleteReason` (thirteen values):

- `no-products-selected`, `no-pairs-to-evaluate`, `unresolved-inputs`,
  `dataset-version-missing`, `pair-limit-exceeded`, `provider-pair-coverage-incomplete`,
  `provider-pair-coverage-invalid`, `provider-version-mismatch`, `record-pair-outside-request`,
  `record-dataset-version-mismatch`, `evidence-link-invalid`, `unsupported-context`, `stale-source-data`.

`UnresolvedInteractionInputReason` (eleven values):

- `product-not-found`, `no-ingredients`, `unresolved-mapping`,
  `confirmed-mapping-missing-ingredient`, `dangling-ingredient`, `malformed-snapshot`,
  `dataset-version-mismatch`, `dataset-version-missing`, `no-products-selected`,
  `unknown-ingredient`, `unreviewed-ingredient-mapping`.

Observed `unavailableReason` strings in the implementation:

- `provider-description-error` (when `describe()` throws),
  `provider-descriptor-invalid` (when the descriptor lacks usable capabilities),
  `provider-result-invalid` (when the provider payload is malformed or post-call
  processing fails), `rights-not-permitted`,
  `online-required`, `timeout-scheduler-unavailable`, `provider-timeout`, `provider-error`,
  and the provider-supplied reason or `provider-unavailable` when the provider itself reports
  unavailable.

A throwing `describe()` yields `unavailable` with an empty source-version list on the base
plus the accumulated expansion reasons and `provider-pair-coverage-incomplete`; rights and offline gates return `unavailable` with
empty evaluated coverage and the same accumulated reasons before any pair work. Every
`unavailable` return carries the accumulated incomplete reasons alongside its
`unavailableReason`, never an empty list when inputs were already unresolved.

### Severity mapping

- `mapSeverity` first strips any incoming `normalizedSeverity`, `severityMappingVersion` and
  `severityMappingReviewed` fields from the record, so provider payloads cannot smuggle in a
  normalized value.
- Without a mapping, or when `severity` is absent, the source record is returned unchanged.
- With a mapping, only an explicit own-property entry in `mapping.map` is applied; any other
  source term maps to `unmapped`. When the source severity is absent but a mapping was
  requested, `normalizedSeverity` is set to `unmapped` explicitly. The original `severity` is kept verbatim and
  `severityMappingVersion` is set to the mapping version.
- The `reviewed` flag appears as `severityMappingReview` (`mappingVersion`, `reviewed`) on
  the evaluation, and when it is not `true` each mapped record additionally carries
  `severityMappingReviewed: false` next to `normalizedSeverity` and
  `severityMappingVersion`.

### Timeout and error mapping

- The default provider timeout is 10,000 ms; a non-finite or negative `timeoutMs` throws
  `RangeError`.
- The timer is the injected `options.timer` or a `setTimeout` / `clearTimeout` wrapper when
  available; when neither exists the evaluation returns `unavailable` with
  `timeout-scheduler-unavailable` and per-pair `not-covered` coverage.
- Provider calls race against the timer; a non-timeout outcome cancels the timer handle.
- Every provider call receives an abort signal: the timeout path aborts the controller
  when the timer wins, so an observing provider sees `signal.aborted === true`.
  A provider that ignores the signal still maps to `unavailable` with `provider-timeout`.
- A rejected provider promise maps to `unavailable` with `provider-error`; a timer win maps
  to `unavailable` with `provider-timeout`. Both attach per-pair `not-covered` coverage and
  never leak the provider's exception text into the result.

### Rights and offline handling

- `rightsStatus !== 'permitted'` (that is, `not-permitted` or `unknown`) returns
  `unavailable` with `rights-not-permitted` and does not call `provider.evaluate`.
- `availability === 'online-only'` with `online === false` returns `unavailable` with
  `online-required` and does not call `provider.evaluate`.
- Offline checking therefore uses only providers that describe themselves as
  `offline-licensed` (and permitted); an online-only provider is explicitly unavailable
  offline.

### Multi-provider merging and disagreement

- `mergeProviderResults` requires at least two provider results at both the tuple-type level
  and at runtime (`RangeError` otherwise).
- Records are concatenated after canonicalizing each record's pair; evidence arrays are
  concatenated; source versions are deduped triples of provider, source and version.
- Disagreements are derived per pair: `severity-terms-differ` only when at least two
  different providers report different severity strings for the pair (two records from
  the same provider never trigger it); `reported-vs-covered-no-record` when one
  provider reports the pair as `reported` and a different provider reports it as
  `covered-no-record`. Each disagreement carries the pair, the reasons and the contributing
  severity terms with provider, source and version.
- The merge creates no combined severity and no combined verdict; it has no `status` field.

### Provider payload validation and record provenance

- A provider result whose `records`, `pairCoverage` or `evidence` is not an array (or is
  otherwise malformed) yields `unavailable` with `provider-result-invalid`; a descriptor
  without usable `capabilities` yields `unavailable` with `provider-descriptor-invalid`.
  Any unexpected exception during post-call processing maps to `unavailable` as well, so
  evaluation never rejects because of provider data.
- A record whose `datasetVersionId` differs from the pinned selection version is kept with
  its own version visible (never rewritten) and adds the `record-dataset-version-mismatch`
  incomplete reason.
- When the provider reports `unavailable` but returns records, the records are kept with
  the provider's reason and the evaluation carries `recordsFromUnavailableProvider: true`,
  so a UI can qualify them instead of silently showing or dropping them.

## 4. Safety properties

- Source vocabulary is kept verbatim. `DrugInteraction.severity` is optional source text;
  normalization is opt-in and explicit. The test
  `reports a source record while preserving its exact source severity vocabulary` asserts the
  source term `source-band-amber` is preserved and that `normalizedSeverity` is absent without
  a mapping; the contract assertion
  `preserves source severity terms and leaves absent source fields absent` asserts the same
  through the full evaluation.
- Optional fields are absent rather than fabricated. The contract test checks that absent
  record keys (`normalizedSeverity`, `severityMappingVersion`, `severityMappingReviewed`,
  `clinicalEffect`, `mechanism`, `evidenceLevel`, `management`, `monitoring`, `alternatives`,
  `sourceInteractionId`, `upstreamUpdatedAt`) and absent evidence keys (`sourceReferenceId`,
  `title`, `organization`, `publicationDate`, `urlOrDoi`, `evidenceLevel`,
  `sourceTerminology`) stay absent with `Object.hasOwn`.
- There is no `safe` or `no interaction` wording. The test
  `keeps source versions and does not label a result as safe or as no interaction` stringifies
  the evaluation and asserts it does not match `/\bsafe\b|\bnone\b|no interaction/i`; the
  `no-reported-record` state means only that the source evaluated the covered pairs and
  returned no record.
- There is no LLM. `packages/domain/src/interactions.ts` imports only selection expansion,
  catalogue snapshot types and id types; no model, prompt, completion or explanation path
  exists in the contract. Generated explanations cannot change severity, doses, management or
  meaning because there is no generation step.

## 5. Synthetic providers and the contract suite

All fixtures use fictional source ids (for example `SP-REPORTED-FICTIVOL`,
`AI-REPORTED-FICTIVOLINUM`); they demonstrate one ingredient and combinations and assert
nothing about a real brand's composition.

Providers in `tests/domain/synthetic-interaction-providers.ts`:

- Offline licensed (`synthetic-offline-provider`, `synthetic-interactions-v1`,
  `source-band-amber`) — reports the first requested pair, marks the rest
  `covered-no-record`; used for the reported-record path.
- Online only (`synthetic-online-provider`, `synthetic-interactions-online-v1`,
  `source-band-violet`) — returns `unavailable` with `online-required` when the request is
  offline; otherwise behaves like the offline provider.
- Partial coverage (`synthetic-partial-provider`, `synthetic-interactions-v1`) — leaves one
  pair `not-covered` with `synthetic-partial-coverage` and marks it stale; used for
  stale/partial coverage tests.
- Throwing (`synthetic-throwing-provider`) — throws `synthetic provider failure detail` when
  the request contains the throw-trigger ingredient; used for provider-error mapping.
- Timeout (`synthetic-timeout-provider`) — never resolves when the request contains the
  timeout-trigger ingredient; used for provider-timeout mapping.
- Second vocabulary (`synthetic-second-vocabulary-provider`, `synthetic-interactions-v2`,
  `tier-cyan`) — same shape as offline but with a different severity term and source version;
  used for disagreement tests.
- Covered without a record (`synthetic-covered-no-record-provider`) — reports no records and
  marks every pair `covered-no-record`; used for the explicit no-reported-record path.
- Reversed order (`synthetic-offline-provider` shape with record and coverage pairs in
  reversed order) — used to prove pairs are canonicalized before matching.
- Outside pair (`synthetic-offline-provider` shape plus a record for an unrequested pair, a
  self-pair record and coverage for an unrequested pair) — used for
  `record-pair-outside-request` and `provider-pair-coverage-invalid`.
- Omitted coverage (`synthetic-offline-provider` shape with coverage dropped for one
  requested pair) — used for `provider-omitted-pair-coverage`.
- Version mismatch (`synthetic-offline-provider` shape with a disagreeing `providerId` /
  `sourceVersion` and a record from another dataset generation) — used for
  `provider-version-mismatch` and `record-dataset-version-mismatch`.
- Dangling evidence (`synthetic-offline-provider` shape with `evidenceIds` pointing at
  missing evidence and no evidence payload) — used for `evidence-link-invalid`.

Shared helpers: `makeSyntheticSelection` builds a pinned synthetic catalogue from product
specs (defaulting to a `reviewed` crosswalk, with opt-in `unreviewed`, `rejected` or empty
mappings); `CONTRACT_REQUEST` / `CONTRACT_SELECTION` / `CONTRACT_CONTEXT` give the three-pair,
three-ingredient contract fixture with a fixed retrieval timestamp;
`THROW_TRIGGER_SELECTION` / `TIMEOUT_TRIGGER_SELECTION` carry the error/timeout trigger
ingredient ids for the contract fault paths.

Contract assertions in `tests/domain/interaction-provider-contract.ts`
(`describeProviderContract`, 9 assertions run once per provider, 7 providers, 63 cases):

1. `describes a stable provider, source, availability, capability, and rights status`.
2. `returns coverage for each canonical requested pair and no outside pair` — compared
   against a fixed expected pair list derived from the contract ingredients, not by echoing
   the request; duplicates and non-canonical pairs fail.
3. `preserves source severity terms and leaves absent source fields absent`.
4. `links every evidence identifier to its interaction record`.
5. `uses canonical pairs independent of argument order`.
6. `maps provider errors and timeouts to unavailable results` — generic wrappers plus the
   provider's own fault path via the trigger-ingredient selections.
7. `respects offline provider availability`.
8. `receives canonical ingredient ids, context, online mode, and the pinned dataset version` — including the abort signal.
9. `exposes explicit coverage completeness on every evaluation`.

## 6. Requirements traceability

Requirement text is from `plan/REQUIREMENTS.md`; spec items are from the `Tests and gates`
paragraph of `plan/INTERACTIONS.md`. Test names are quoted exactly. Mappings are behavioural
(no requirement ids are annotated in the test files); gaps are marked as gaps.

| Requirement / spec item                                                                                        | Test(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Notes                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R50 — selections resolve to confirmed canonical ingredients; combinations expand                               | `marks unresolved ingredients incomplete and does not guess their identity`; `expands a combination product while retaining its product-to-ingredient mapping`; contract `receives canonical ingredient ids, context, online mode, and the pinned dataset version`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Covered for product-based selection                                                                           |
| R51 — direct ingredient input; ambiguous input needs correction or incomplete coverage                         | `evaluates two directly selected ingredients with a known synthetic reported pair`; `includes direct ingredients alongside product ingredients in pair building`; `marks unknown direct ingredient ids incomplete with unknown-ingredient and no guessing`; `records direct duplicate of a product ingredient with both origins and no self-pair`; `counts direct ingredients toward the too-many-pairs limit`                                                                                                                                                                                                                                                                                                                   | Covered: direct input via `InteractionSelection.ingredientIds`, with `unknown-ingredient` incomplete coverage |
| R52 — unordered unique pairs, product-component mappings, duplicate vs self-interaction                        | `canonicalizes pairs and returns the full unique pair set without self-pairs`; `returns an explicit pair-limit outcome without truncating the pair set`; `expands a combination product while retaining its product-to-ingredient mapping`; `reports duplicate exposure separately and never creates a self-pair`; `returns an incomplete evaluation when the configured pair limit is exceeded`; contract `returns coverage for each canonical requested pair and no outside pair`, `uses canonical pairs independent of argument order`, `receives canonical ingredient ids, context, online mode, and the pinned dataset version`                                                                                             | Covered                                                                                                       |
| R53 — vendor-neutral provider with version, coverage, unresolved inputs, unavailable/error states              | `returns unavailable when provider rights are not permitted or online access is required`; `maps thrown and timed-out provider calls to unavailable without leaking exceptions`; `marks unsupported context limitations incomplete without calling an incapable provider`; `returns an incomplete evaluation when the configured pair limit is exceeded`; contract `describes a stable provider, source, availability, capability, and rights status`, `returns coverage for each canonical requested pair and no outside pair`, `maps provider errors and timeouts to unavailable results`, `respects offline provider availability`, `receives canonical ingredient ids, context, online mode, and the pinned dataset version` | Covered                                                                                                       |
| R54 — source vocabulary preserved; normalized severity needs a versioned reviewed mapping with unmapped states | `reports a source record while preserving its exact source severity vocabulary`; `applies only explicit severity mappings and flags unreviewed mappings`; contract `preserves source severity terms and leaves absent source fields absent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Covered; no clinically reviewed mapping is provided here                                                      |
| R55 — references, effect, mechanism, evidence, management, monitoring, alternatives only when supplied         | Contract `preserves source severity terms and leaves absent source fields absent`; contract `links every evidence identifier to its interaction record`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Covered as absence-preservation; no real clinical fields are populated by synthetic fixtures                  |
| R56 — no record means at most no reported interaction within coverage, never safety                            | `uses no-reported-record only when every requested pair is explicitly covered without records`; `keeps source versions and does not label a result as safe or as no interaction`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Covered                                                                                                       |
| R57 — offline checking uses only licensed downloaded records; online-only shows unavailable offline            | `returns unavailable when provider rights are not permitted or online access is required`; contract `respects offline provider availability`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Covered at the contract level; no download/persistence layer in this commit                                   |
| R58 — provider selection assesses quality, coverage, freshness, evidence and rights                            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Gap: provider selection is an owner decision; no code or test selects a real source in this commit            |
| R59 — disagreement, missing fields, stale versions, omitted pairs are not concealed                            | `keeps stale or partial pair coverage visible alongside reported records`; `merges provider records and flags source-term and reported-versus-covered disagreement`; `keeps source versions and does not label a result as safe or as no interaction`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Covered                                                                                                       |
| R65 — interaction sources abstracted behind stable protocols/interfaces                                        | Contract suite as a whole (notably `describes a stable provider, source, availability, capability, and rights status`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Behavioural mapping; the stable protocol is `DrugInteractionProvider`                                         |
| R107 — an LLM is never primary authority for deciding an interaction exists                                    | Structural (no LLM import or call in the contract) plus `keeps source versions and does not label a result as safe or as no interaction` for the no-synthesis check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | No dedicated LLM test; the property holds by construction                                                     |
| Spec — known reported synthetic pairs                                                                          | `reports a source record while preserving its exact source severity vocabulary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Covered                                                                                                       |
| Spec — explicit covered-no-record synthetic pairs                                                              | `uses no-reported-record only when every requested pair is explicitly covered without records`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Covered                                                                                                       |
| Spec — unresolved ingredients                                                                                  | `marks unresolved ingredients incomplete and does not guess their identity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Covered                                                                                                       |
| Spec — provider unavailable                                                                                    | `returns unavailable when provider rights are not permitted or online access is required`; `maps thrown and timed-out provider calls to unavailable without leaking exceptions`; contract `maps provider errors and timeouts to unavailable results`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Covered                                                                                                       |
| Spec — duplicate exposure                                                                                      | `reports duplicate exposure separately and never creates a self-pair`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Covered                                                                                                       |
| Spec — combination expansion                                                                                   | `expands a combination product while retaining its product-to-ingredient mapping`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Covered                                                                                                       |
| Spec — source vocabulary                                                                                       | `reports a source record while preserving its exact source severity vocabulary`; contract `preserves source severity terms and leaves absent source fields absent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Covered                                                                                                       |
| Spec — disagreement                                                                                            | `merges provider records and flags source-term and reported-versus-covered disagreement`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Covered                                                                                                       |
| Spec — stale/incomplete coverage                                                                               | `keeps stale or partial pair coverage visible alongside reported records`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Covered                                                                                                       |
| Spec — pair limits                                                                                             | `returns an explicit pair-limit outcome without truncating the pair set`; `returns an incomplete evaluation when the configured pair limit is exceeded`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Covered                                                                                                       |
| Spec — offline rights                                                                                          | `returns unavailable when provider rights are not permitted or online access is required`; contract `respects offline provider availability`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Covered                                                                                                       |
| Spec — actual clinical provider needs its own validation set and licensed fixtures                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Gap: explicitly out of scope for the synthetic-only M9 code part                                              |

## 7. Tests

Counts come from the checked-in logs in `docs/evidence/milestone-9-2026-10-12/`; toolchain was
Node.js `v24.21.0` with npm `11.19.0` and the compiled-artifact runtime Node.js `v22.23.2`.

- Test-first: `interaction-provider-red-green.log` records RED (before implementation) with 56
  failed and 15 passed across the two focused files (71 total), then GREEN with 71 passed in
  2 files after implementation.
- R51 direct-ingredient input: `r51-direct-ingredient-red.log` records 5 failed, then
  `r51-direct-ingredient-green.log` records 20 passed in `tests/domain/interactions.test.ts`.
- PR #20 review fixes: `pr20-1-red.log` / `pr20-1-green.log` cover the explicit
  `coverageComplete` flag (3 new evaluation tests plus 7 new contract cases, 86 passed
  across the two focused files); `pr20-2-red.log` / `pr20-2-green.log` cover the
  cross-provider disagreement rule (87 passed across the two focused files).
- PR #20 review round 2: `pr20-r2-<n>-red.log` / `pr20-r2-<n>-green.log` (n = 1, 2, 4–11)
  record each item test-first; `pr20-r2-focused-green.log` is the regenerated focused run
  with 110 passed across the two focused files (`tests/domain/interactions.test.ts` with
  47 tests, `tests/domain/interaction-provider-contract.test.ts` with 63 cases: 9
  assertions for each of 7 providers).
- Full unit suite at the round-2 HEAD: 60 test files with 1,049 tests, 1,048 passed and
  1 failed in `tests/importer/artifact.test.ts`
  (`builds under the OS temp directory when no output parent is supplied`, an environment
  path assertion unrelated to the domain; it fails identically with the review changes
  stashed). Format, lint, typecheck and the architecture boundary check passed; the run is
  captured in `pr20-r2-full-unit.log`.
- The earlier `non-web-gates.log` and `aggregate-check-partial.log` record the pre-R51
  baseline of 60 test files with 1,010 tests passed; the orchestrator's re-run confirmed
  that baseline under Node 24.21.0 and Node 22.23.2.
- The implementer's aggregate check (`aggregate-check-partial.log`) was interrupted during the
  browser suite: the Vite build and distribution secret scan completed, the Playwright suite
  started (162 tests) and was interrupted with no result, and the command exited 1. The
  browser suite is covered by CI on the PR.
- `repository-base.log` records a successful fetch before inspection on the
  implementer's source branch `mujadarah/m9-interaction-provider` (this work continues on
  `codex/m9-interaction-provider`), `origin/main` at `597d1a5`, and a PASS for the
  merge-base ancestry check.

### Review fixes (PR #20)

1. Explicit coverage completeness: `coverageComplete` is set on every evaluation status and
   is `true` only with fully resolved inputs, per-pair `reported` / `covered-no-record`
   coverage, no truncation, an available provider and no incomplete reasons;
   `no-reported-record` implies `true`. The contract suite asserts the flag on every
   evaluation.
2. Disagreement only across providers: `severity-terms-differ` now requires different
   severity terms from at least two different providers; two records from one provider
   no longer flag it.
3. Credential-scanner hygiene in tests: the `sourceRecordKey === '<literal>'` comparisons
   now go through a `findIngredientByRecord` helper (plus record constants that do not end
   in key/token), and the PR diff contains no `key|token|secret === '<literal>'` pattern.
4. Complexity split: `packages/domain/src/interactions.ts` is now a thin re-export barrel
   over `packages/domain/src/interactions/` (`types.ts`, `pairs.ts`, `selection.ts`,
   `severity.ts`, `evaluate.ts`, `merge.ts`); every file is well under 500 lines and every
   function is under 100 lines. Public exports from `@intermed/domain` are unchanged
   (verified by before/after `Object.keys`).
5. Corrupt snapshot items no longer throw (round 2, CodeRabbit): non-object entries in
   `products`, `activeIngredients` or `medicationIngredients` are skipped with an
   `isRecord` guard and yield an `incomplete` evaluation with a `malformed-snapshot`
   unresolved input and `coverageComplete: false`.
6. Provider timeouts are observable (round 2, CodeRabbit): `ProviderRequest` carries an
   optional abort `signal`; the timeout path aborts the controller when the timer wins.
   The domain stays dependency-free (no new imports; the architecture boundary check
   passes).
7. Unreviewed crosswalks block coverage (independent review): an active ingredient with no
   `reviewed` external mapping yields `unreviewed-ingredient-mapping`, still evaluated so
   reported records are shown, but coverage is never complete. The same rule applies to
   direct ingredient input, including empty crosswalks.
8. Malformed provider data maps to `unavailable` (independent review): a result guard gives
   `provider-result-invalid`, a descriptor guard gives `provider-descriptor-invalid`, and
   post-call processing is wrapped so evaluation never rejects.
9. Record dataset versions are checked (independent review): a record from another dataset
   generation is kept with its own version and adds `record-dataset-version-mismatch`.
10. Severity mapping travels per record (independent review): an unreviewed mapping adds
    `severityMappingReviewed: false` next to `normalizedSeverity` and
    `severityMappingVersion` (the top-level marker is kept), and an absent source severity
    with a requested mapping is explicit `unmapped`.
11. Unavailable evaluations keep their reasons (independent review): every `unavailable`
    return carries the accumulated incomplete reasons, and records kept from an
    unavailable provider are qualified with `recordsFromUnavailableProvider: true`.
12. Adversarial coverage and contract hardening (independent review): synthetic providers
    for reversed pairs, outside/self-pair records, omitted coverage, identity mismatches
    and dangling evidence; the contract coverage assertion compares against a fixed
    expected pair list and the error/timeout blocks exercise the providers' own trigger
    selections.

## 8. Open items

- Provider selection (the owner's decision). No clinical source is approved; the assessment
  and rights decision must precede any clinical release.
- Persisting downloaded interaction records (a later milestone, with a Dexie migration).
  This commit adds no storage, caching or retrieval-date persistence beyond in-memory
  evaluation metadata.
- The M10 UI: product and direct-ingredient selection, coverage and provenance display,
  disagreement rendering and offline/error states.
- A clinically reviewed severity mapping. The contract supports a versioned mapping with an
  explicit `reviewed` flag and `unmapped` states, but no clinical mapping is provided here.
- Real-provider validation sets: licensed fixtures and a clinically reviewed validation set
  for the selected provider, required before release.
