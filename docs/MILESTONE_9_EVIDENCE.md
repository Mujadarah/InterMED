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

> Historical scope: sections 1–8 record the original M9a implementation and PR #20 review evidence. The M9b section at the end records lifecycle and independent assessment dimensions at the current branch baseline; earlier file inventories, counts and assessment-availability statements refer to the original snapshot.

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
- `InteractionDisagreementReason` — `severity-terms-differ` or `reported-vs-covered-no-record`. **Superseded by assessment logic 3.0.0: the reason is now only `severity-terms-differ`; coverage differences are reported separately as `coverageDiscrepancies`.**
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

> Superseded by assessment logic 3.0.0: `reported-vs-covered-no-record` no longer
> produces an `InteractionDisagreement`. Disagreements hold only clinical evidence
> disagreements (today `severity-terms-differ`). A documenting source beside a
> no-record source is reported separately as `coverageDiscrepancies`.

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
- Orchestrator re-run at `6b5dca5` from PowerShell (Node 24.21.0, Node 22.23.2 runtime
  under `.tools`): format, lint, typecheck, unit tests (60 files, **1,049 of 1,049 passed**,
  including `tests/importer/artifact.test.ts`) and the boundary check all passed. The
  implementer's single importer failure is specific to its shell environment (Windows
  variable names exported in upper case break the `os.tmpdir()` fallback in worker
  threads), not to the code. The browser suite runs in CI.
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

## Record lifecycle and interaction dimensions (M9b)

Date: 2026-10-12. Branch `codex/m9-lifecycle`, implementation verified at `a3f95f0` after merging main and the severity-conflict fix. The owner **rejected the single five-level outcome precedence on 2026-10-12** and required four independent dimensions: finding, evidence, currency and coverage, with record-level provenance. Commit `72af7f2` adds dimension tests, `2bd76f5` implements assessment, `8105428` adds withdrawn-plus-current history coverage, and `dabf2bb` limits the direct severity-conflict comparison to different sources. **Final owner clinical sign-off is pending.** All fixtures are synthetic; this evidence does not approve a clinical provider, dataset, severity mapping or M10 release.

### Source-supplied lifecycle and inactive records

`packages/domain/src/interactions/types.ts` declares required `recordStatus` as `current`, `superseded` or `withdrawn`, optional `supersededBy` and `statusChangedAt`, and required `updateHistory`. Each history entry carries the source's `sourceVersion`, `changedAt` and `change` (`created`, `updated`, `superseded` or `withdrawn`). Lifecycle status, replacement identifiers, timestamps and history are source-supplied only; the evaluator does not invent a transition, replacement or history from record age or absence. Empty history is permitted and preserved. Optional metadata remains absent when not supplied.

`packages/domain/src/interactions/evaluate.ts` validates lifecycle enums/history shapes and the types of supplied optional metadata; malformed payloads become unavailable rather than being silently assigned a default lifecycle status. This is structural validation, not clinical verification of the source's chronology or replacement relationship.

`collectValidRecords` in `packages/domain/src/interactions/severity.ts` canonicalizes requested pairs and retains current records in `interactions`. Superseded/withdrawn records remain visible in `inactiveRecords` as `{ record, reason }`, with the reason matching the source status. They do not become active interaction findings. A current replacement can be reported while its superseded predecessor remains in `inactiveRecords`, with its original `supersededBy` retained.

`buildEvaluatedCoverage` in `packages/domain/src/interactions/pairs.ts` adds `only-inactive-records` when a pair has inactive records and no current record. Coverage becomes `not-covered` (or retains `unsupported-context`) and carries that reason; missing provider coverage also retains the omitted-coverage incomplete reason. A provider's `covered-no-record` claim cannot erase the inactive record or turn this into a complete no-reported-record evaluation. These cases remain coverage-incomplete.

Record currency is separate from lifecycle status. The evaluator compares a record's `sourceVersion` against the provider descriptor's expected version, derives `isOutdated: true` on a mismatch and adds `outdated-record-source-version`. It preserves the record and its original version, without trusting a provider-supplied `isOutdated` flag or rewriting provenance. A `current` record can therefore remain in `interactions` while being marked outdated and coverage-incomplete. The pair assessment lists it in `outdatedRecordIds` rather than counting it as a current documented finding. This version comparison is not a clinical age/expiry policy.

`sourceStatesUncertainEvidence?: boolean` preserves explicit source-stated uncertainty. Only `true` triggers that uncertainty condition; an absent flag is not inferred from missing fields, an unreviewed ingredient mapping, record age or an evidence label. Such coverage/input limitations remain separately visible.

### Assessment API and independent dimensions

The actual exported API at this baseline is **`assessInteractionPair(input, pair)` (singular)** in `packages/domain/src/interactions/assessment.ts`, re-exported by `packages/domain/src/index.ts`. There is no exported `assessInteractionPairs` function. `PairAssessmentInput` accepts one `InteractionEvaluation`, an array of evaluations, or `MergedProviderResults`; one explicit ingredient pair is assessed per call and canonicalized. `PairAssessment` is declared in `packages/domain/src/interactions/types.ts`. The former `categorizeInteractionOutcomes` export and outcome-category types are removed, and a test asserts the old export is absent.

Each returned assessment contains all four dimensions and `provenance`; no dimension replaces another with a single clinical verdict:

| Dimension  | Fields                                                                       | Meaning                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finding`  | `documentedInteraction`, `affirmedNoInteraction`, `sourceSeverities`         | Current documented findings, a tightly constrained source-affirmed negative finding, and source-specific severity terms. **Superseded by assessment logic 2.0.0 (see Owner sign-off 2026-10-14 below): `affirmedNoInteraction` is removed and there is no affirmative-negative finding concept.** |
| `evidence` | `evidenceConflict`, `positions`, `sourceStatedUncertainty`, `evidenceLevels` | Conflicting evidence/positions, source statements, explicit uncertainty and source-supplied evidence levels.                                                                                                                                                                                      |
| `currency` | `currentRecordIds`, `historicalRecordIds`, `outdatedRecordIds`               | Valid current findings, retained history and source-version-mismatched records.                                                                                                                                                                                                                   |
| `coverage` | `status`, `coverageComplete`, `reasons`                                      | Pair-specific evaluation availability/completeness and its limitations.                                                                                                                                                                                                                           |

A current finding can coexist with conflicting evidence, historical records, uncertainty or incomplete coverage. A withdrawn record never cancels a current finding. The assessment generates no “safe” or unqualified “no interaction” message; it preserves structured facts without a generated clinical explanation.

### Finding: current documentation and source-specific severities

`finding.documentedInteraction` is true only when the pair has at least one **valid current** record. `recordStatus` must be `current`, the record must not be in historical input, and its source/version must match the expected source/version. For `InteractionEvaluation` input, its dataset version must also match the evaluation's pinned dataset version. A source-version-mismatched record can retain source status `current` while being excluded from this valid-current set. Historical or outdated records alone do not document a current finding. Evidence conflict or coverage limitations do not erase a valid current finding.

`finding.affirmedNoInteraction` is true only if at least one source position is `affirms-none`, **coverage is complete**, and there is **no valid current documenting record**. A complete source's explicit `covered-no-record` coverage with no source records supplies that negative position. Missing records alone, historical-only records, unresolved inputs, omitted coverage, unsupported context, provider unavailability, online-only/offline restrictions, blocked rights or truncated evaluation cannot establish the flag. A source's negative position cannot cancel another source's current documented finding; both source positions remain visible.

> Superseded by assessment logic 2.0.0 (see Owner sign-off 2026-10-14 below). Covered-no-record is not a negative assertion: the `affirms-none` position and `finding.affirmedNoInteraction` no longer exist. A complete covered-no-record source reports `no-record-in-coverage` and never an affirmative claim that no interaction exists.

`sourceSeverities` preserves entries for all retained pair records, including history/outdated records, with `sourceId`, `sourceVersion`, `recordId` and verbatim `severityTerm` only when supplied. No combined severity or inferred term is produced. For evaluation inputs, `normalizedSeverity` is exposed only when the evaluation mapping is reviewed, the record explicitly carries the reviewed flag and the mapping version matches. A matching unreviewed mapping is marked `severityMappingReviewed: false` without exposing its normalized severity. Merged raw provider input has no evaluation mapping-review context, so the assessment preserves raw terms without inventing reviewed normalization.

### Evidence: conflicts, source positions and uncertainty

`evidence.evidenceConflict` combines three inputs:

- Explicit non-empty disagreements for the pair supplied through `MergedProviderResults`.
- Coexisting `documents-interaction` and `affirms-none` source positions. **Superseded by assessment logic 2.0.0: the second position is now `no-record-in-coverage`, and the conflict is a disagreement in what sources hold, not a negative finding.**
- Different verbatim severity terms on valid current records from **different `sourceId` values**. The direct comparison requires both terms to be present; provider identity alone is not the source identity check.

The `dabf2bb` regression tests pin the last rule: differing current-record severities within **one source** remain separate terms and do not alone trigger that comparison; differing terms across **different sources** do. Historical/outdated terms are preserved but are not fed to this direct current-record comparison. Explicit merged disagreements remain separate supplied inputs; the assessment does not reclassify their supplied disagreement reasons.

Each `positions` entry includes `sourceId`, `sourceVersion` and one of `documents-interaction`, `affirms-none`, `no-coverage` or `unavailable`. A source with a non-historical `current` record reports `documents-interaction`; a historical-only source reports `no-coverage`; otherwise unavailable sources report `unavailable`, and available, non-stale, structurally valid `covered-no-record` sources report `affirms-none`. Other cases report `no-coverage`. Positions preserve what a source reports and can therefore coexist with a false current-finding flag for an outdated record or with incomplete overall coverage. Identical source/version/position entries are deduplicated and sorted.

> Superseded by assessment logic 2.0.0 (see Owner sign-off 2026-10-14 below). The position is now `no-record-in-coverage` (not `affirms-none`): "No interaction record identified within that source's evaluated coverage." It is never an affirmative clinical assertion that no interaction exists.

`sourceStatedUncertainty` is true when any retained pair record explicitly supplies `sourceStatesUncertainEvidence === true`, including historical/outdated records. It is not inferred from missing fields, source age, unreviewed mappings or a text evidence label. `evidenceLevels` retains each record's `sourceId`, `recordId` and optional verbatim `evidenceLevel`; missing levels remain absent. Uncertainty is independent of `evidenceConflict` and `documentedInteraction`.

### Currency and per-record provenance

`currentRecordIds` contains the valid-current set used for `documentedInteraction`; `historicalRecordIds` contains superseded/withdrawn records and records supplied through `inactiveRecords`; `outdatedRecordIds` contains source-version-mismatched records (or an evaluator-derived outdated flag for evaluation input). These are separately deduplicated and sorted sets, not mutually exclusive lifecycle labels: a historical record may also be outdated. Neither history nor an outdated record overrides a current record. Historical-only assessments keep the history and incomplete coverage with no affirmative-negative finding concept (superseded wording for the former `affirmedNoInteraction` flag; see assessment logic 2.0.0 below).

`provenance` retains `sourceId`, `sourceVersion`, `recordId`, `datasetVersionId` and optional `retrievedAt` per record. Retrieval time comes from matching linked evidence for the same record/source/version, choosing the first sorted supplied timestamp, or an available pair-coverage/provider-result fallback; no current timestamp is invented. Source and dataset versions are never rewritten to make a record appear current. For raw `MergedProviderResults`, the assessment checks each record against its provider-result source/version; there is no evaluation-level pinned dataset comparison on that input path, while each record's dataset version remains in provenance.

### Coverage remains explicit alongside findings

`coverage.status` is one of `covered`, `not-covered`, `unsupported-context`, `inputs-unresolved`, `unavailable` or `truncated`. The status function checks truncation first, then unresolved inputs, source unavailability, unsupported context, missing/incomplete source coverage, and otherwise returns `covered`. This is availability reporting within the coverage dimension, not a clinical outcome hierarchy.

`coverageComplete` additionally requires `covered` status, every source complete, no global structural/evidence-link invalidity and no outdated/source/dataset mismatch among retained records. A complete reported source needs a valid current record and no invalid current record; a complete `covered-no-record` source needs no records. Sources must also be available, covered, non-stale and free of duplicate/invalid coverage. Consequently, `status: covered` alone does not guarantee `coverageComplete: true` when another validity check fails.

`reasons` is a sorted, deduplicated list of recognized limitation codes, including `only-inactive-records`, `outdated-record-source-version`, `record-dataset-version-mismatch`, `provider-version-mismatch`, `provider-pair-coverage-incomplete`, `provider-pair-coverage-invalid`, `evidence-link-invalid`, `unresolved-inputs`, `unsupported-context`, `stale-source-data`, `online-required`, `rights-not-permitted`, provider-error/unavailability and `pair-limit-exceeded` where applicable. Unknown provider reason text is not copied into an unrestricted clinical explanation. The assessment reconstructs pair-specific source coverage rather than treating the whole evaluation's status or incomplete-reason list as a single finding.

### Contract and adversarial fixtures

The existing provider contract still asserts explicit lifecycle metadata/history, source terminology and absent fields, fixed expected pair coverage, evidence links, canonical ordering, errors/timeouts, offline availability, request propagation and coverage completeness. Lifecycle fixtures retain withdrawn-only, superseded-only, superseded-plus-current, withdrawn-with-claimed-covered-no-record, outdated and explicitly uncertain records. The new withdrawn-plus-current fixture confirms that withdrawn history and a current documented record coexist. Existing reversed-pair, outside/self-pair, omitted-coverage, provider-identity and dangling-evidence tests remain in place.

`tests/domain/interaction-dimensions.test.ts` now contains **13 tests**: ten named scenarios, removal of the rejected API, and two severity-conflict regressions. They cover current findings alongside source disagreement; withdrawn-plus-current history; historical-only findings; complete source-affirmed negative coverage; a negative source alongside another current finding; incomplete/unresolved/unsupported/unavailable/offline/rights-blocked/truncated coverage; outdated source versions; explicit uncertainty/evidence levels; neutral structured output; deterministic deeply frozen assessments; and same-source versus cross-source severity differences. The scenarios also verify reviewed versus unreviewed severity mappings. These synthetic tests establish contract behavior, not final clinical acceptance.

> Superseded in part by assessment logic 2.0.0 (see Owner sign-off 2026-10-14 below). "Complete source-affirmed negative coverage" and "a negative source" now mean complete covered-no-record reported as `no-record-in-coverage` with no `affirmedNoInteraction` concept; scenarios 4, 5 and 9 are re-tested under logic 2.0.0.

### Recorded checks and post-merge verification

Dimension logs are in `docs/evidence/milestone-9-2026-10-12/`:

| Log                             | Recorded result                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dimensions-red.log`            | Focused feature-red run, exit 1: 2 files failed; **12 failed / 53 passed**. Covers missing dimension behavior, removal of the rejected API and mapping-review behavior. |
| `dimensions-green.log`          | Focused dimensions/lifecycle/provider-contract run, exit 0: **3 files / 146 passed**. This predates the later withdrawn-plus-current and severity regression additions. |
| `dimensions-severity-red.log`   | Focused severity regression: **1 failed / 1 passed / 11 skipped** in 1 file; the same-source case failed while the cross-source case passed.                            |
| `dimensions-severity-green.log` | Focused severity regression: **2 passed / 11 skipped** in 1 file. The filtered skips are not full-suite acceptance.                                                     |

The orchestrator's rerun after merging main and the severity fix reports **format, lint, typecheck, unit tests (1,273 passed), and architecture boundaries passed** at the supplied baseline `a3f95f0`. This is distinct from the earlier dimension-log counts and supersedes the former M9b snapshot's 1,234-test count. The dimension logs above do not record a full `npm run check`; no post-merge audit/build/browser acceptance is inferred. Earlier `lifecycle-*.log` files remain historical evidence of the prior implementation, not acceptance of the rejected outcome model.

The documentation worker independently reran lint, typecheck, unit tests and architecture boundaries at `a3f95f0` using Node `24.21.0`, npm `11.19.0` and Node `22.23.2` via `INTERMED_NODE22_RUNTIME`: **66 files / 1,273 tests passed**, and boundaries passed for **118 source files**. The rewritten document also passed `npx prettier --write` and `npm run format:check`. Only this evidence document was changed.

### Review follow-up: malformed provider payloads

Commit `9578e0d` (found in an independent read-only review) closes a robustness gap on the raw `MergedProviderResults` path. The structural `isProviderResult` guard moved from `evaluate.ts` into a shared `provider-result.ts`. Evaluation behaviour is unchanged.

- `mergeProviderResults` keeps a malformed payload in `providerResults` but takes no records, evidence, source versions or disagreements from it.
- `assessInteractionPair` reports that source as unavailable with `provider-result-invalid`, so the pair's coverage status is `unavailable` and there is no affirmative-negative finding (formerly `affirmedNoInteraction` stays false; superseded by assessment logic 2.0.0 where the field is removed). Before this fix, the code threw a `TypeError` and returned no assessment.
- A valid source's current documented finding remains visible.

The fixture-only reason `synthetic-partial-coverage` is no longer whitelisted in production coverage reasons.

Two new tests failed against the previous source and pass with the fix. With this fix, the non-browser unit suite has 1,275 passing tests; one importer temp-directory test fails only in the orchestrator's local shell, because of its environment, and is unrelated.

Codacy review follow-ups:

- `18ed2d1`: a source position is `documents-interaction` only for a valid current record. Outdated or mismatched records give `no-coverage`, stay in `outdatedRecordIds` and keep coverage incomplete.
- `02999eb`: an unavailable evaluation reports `unavailable` even with no coverage rows.
- `cb657a6`: the shared guard also validates coverage-row pairs and statuses and record field types. Malformed data is unavailable on every path.
- `676111d`: `addEvaluation`, `createAssessment` and scenario 6 are split into helpers or table cases, with no behaviour change.

Four new tests (scenarios 11, 13 and 14, plus a guard test) failed against the previous source and pass with the fixes. The unit suite has 1,284 passing tests, plus the same environment-only importer test that fails locally.

### Pending owner clinical sign-off

The owner's 2026-10-12 decision selects independent finding/evidence/currency/coverage dimensions and record-level provenance; final clinical sign-off of the implemented semantics and presentation is still pending. Review must retain current documented findings alongside conflict, history and coverage limits; keep source-affirmed negatives conditional on complete coverage; preserve verbatim source severity/positions/uncertainty; and avoid an overall clinical verdict. Provider selection, source rights, reviewed ingredient/severity mappings, real-provider clinical validation and M10 presentation remain open as described above and in `docs/INTERACTION_SOURCE_ASSESSMENT.md`.

> Superseded in part by the 2026-10-14 sign-off below: source-affirmed negatives conditional on complete coverage are replaced by assessment logic 2.0.0, where covered-no-record is never a negative finding.

## Owner sign-off (2026-10-14) and assessment logic 2.0.0

Owner decisions on `tests/domain/interaction-dimensions.test.ts` (surgeon, clinical reviewer):

- Approved as presented: scenarios 1-3, 6-8, 10-14.
- Scenario 4 — change required. A source reporting complete pair coverage with no interaction record must be described as "No interaction record identified within Source X's evaluated coverage." Covered-no-record must not be interpreted as an affirmative clinical assertion that no interaction exists. `finding.affirmedNoInteraction` and the `affirms-none` position must not be set solely because a source covers a pair and returns an empty record set. An explicit, supported source assertion may be represented separately from the absence of records.
- Scenario 5 — principle approved, implementation must match scenario 4. A documented interaction from any current valid source stays visible even if another source has no record or explicitly reports a conflicting conclusion. Each source's actual position is preserved without interpreting record absence as an affirmative negative.
- Scenario 9 — change required. InterMED must never generate an unqualified statement declaring a combination "safe" or "no interaction". Original source wording may be reproduced verbatim only when clearly identified as a source statement with provenance, limitations and version; it must never become InterMED's own verdict. Source-native severity terms and evidence grades are kept; unreviewed severity mappings are never clinically authoritative.

What changed in 2.0.0 (`INTERACTION_ASSESSMENT_LOGIC_VERSION = '2.0.0'`, exported from `@intermed/domain`):

- `PairAssessmentSourcePosition`: `'affirms-none'` is replaced by `'no-record-in-coverage'`.
- `PairAssessment.finding.affirmedNoInteraction` is removed. The finding holds only `documentedInteraction` plus `sourceSeverities`. No provider format today carries an explicit, verbatim source assertion, so nothing may set a negative finding.
- `PairAssessment` carries `readonly logicVersion: string`, set to `'2.0.0'` on every assessment, including unavailable and malformed-payload paths. Assessments remain deeply frozen and deterministic.
- `evidenceConflict` remains true when one source documents an interaction and another has no record in coverage. This is a disagreement in what sources hold, not a negative finding. **Superseded by assessment logic 3.0.0: a documents-interaction position beside a no-record-in-coverage position no longer sets `evidenceConflict`; it sets `coverageDiscrepancy` instead.**
- Scenarios 4, 5 and 9 are re-tested under logic 2.0.0 and are pending owner approval at logic 2.0.0.

Fixed display sentences for the UI:

- "No interaction record identified within Source X's evaluated coverage."
- "Absence of a record does not mean the combination is safe."

Source-statement rule (scenario 9): the assessment JSON contains no "safe" or "no interaction" wording across no-record, documented, conflicting, historical-only and unavailable cases, and no key or value contains an affirmative-negative concept. InterMED never issues its own unqualified "safe" or "no interaction" verdict. A future explicit source assertion is out of scope for 2.0.0 and would require, at minimum, the verbatim source statement with its sourceId, sourceVersion and recordId, stated limitations, an explicit "source statement" label, separate versioning, and owner approval. It is documented here only; it is not implemented.

Boundaries: this sign-off does not approve a live provider, a medication database, severity mappings, dosing rules or public clinical release. All fixtures remain synthetic; provider selection, source rights, reviewed ingredient and severity mappings, real-provider clinical validation and M10 presentation remain open.

## Owner sign-off (2026-10-14, round 2) and assessment logic 3.0.0

Owner decisions (surgeon, clinical reviewer), 2026-10-14, round 2:

- Scenario 4 at logic 2.0.0: **APPROVED** (historical evidence kept verbatim above).
- Scenario 9 at logic 2.0.0: **APPROVED** (historical evidence kept verbatim above).
- Scenario 5 at logic 2.0.0: **CHANGES REQUIRED**. A valid documented interaction must
  never be suppressed by another source having no record. Absence of a record in B is
  not evidence contradicting A's documented finding.

What changed in 3.0.0 (`INTERACTION_ASSESSMENT_LOGIC_VERSION = '3.0.0'`, exported from `@intermed/domain`):

- Clinical evidence conflict versus coverage discrepancy are now separate concepts.
  A clinical evidence conflict means sources give genuinely conflicting clinical
  statements or findings, today differing source severity terms for current records
  across sources. A coverage discrepancy means one source documents an interaction
  while another source covers the same pair with no record within its evaluated
  coverage. A coverage discrepancy is a neutral observation and is never clinical
  evidence against the documented finding. No valid documented interaction is
  suppressed, every source position and provenance is preserved, and no absence of
  an interaction or safety is inferred.
- `merge.ts`: `hasReportedVsCoveredDisagreement` no longer produces an
  `InteractionDisagreement` reason. `InteractionDisagreementReason` is now only
  `'severity-terms-differ'`, so `disagreements` holds only clinical evidence
  disagreements. A separate `coverageDiscrepancies: readonly InteractionCoverageDiscrepancy[]`
  is added on `MergedProviderResults`; each entry carries the pair, the documenting
  `{ providerId, sourceId, sourceVersion }` entries and the no-record
  `{ providerId, sourceId, sourceVersion }` entries, sorted deterministically and frozen.
- `assessment.ts`: `evidenceConflict` is now merged clinical disagreements for the pair
  or a cross-source severity conflict among current records. The documents-versus-no-record
  position conflict is deleted. A new `evidence.coverageDiscrepancy: boolean` is true when
  a `documents-interaction` position and a `no-record-in-coverage` position coexist for the
  pair (from positions or merged `coverageDiscrepancies`). Source-native severity terms and
  evidence grades are kept without inference.
- Scenario 5 is implemented in 3.0.0 and stays **pending** owner approval.

Scenario 5 tests (`tests/domain/interaction-dimensions.test.ts`, synthetic providers only):

- A documents (current valid) plus B no-record-in-coverage: `documentedInteraction` true,
  `evidenceConflict` false, `coverageDiscrepancy` true, with both positions and provenance present.
- A documents plus B documents with the same severity term plus C no-record:
  conflict false, discrepancy true.
- A documents severity "X" plus B documents severity "Y" (different sources):
  conflict true; with C no-record also present: conflict true and discrepancy true.
- A documents plus B documents with no no-record source: discrepancy false.
- Merge level: `disagreements` never contains a coverage-only entry;
  `coverageDiscrepancies` lists the documenting and no-record sources.
- Provider order does not change the result.
- The scenario 9 wording guard holds over all these outputs: no `safe`,
  `no interaction` or `affirm` wording, and no affirmative-negative concept.
- `logicVersion === '3.0.0'` on every assessment path, including unavailable and
  malformed-payload paths. Assessments remain deterministic and deeply frozen.

Renewal comparison (throwaway, not committed):

- A throwaway collector ran every scenario 1-14 input and the two severity-conflict
  tests under 2.0.0 (base branch) and 3.0.0, then compared assessment outputs while
  ignoring only `logicVersion` and the added `coverageDiscrepancy` field.
- Changed assessment outputs: scenario 5 (documents plus no-record: `evidenceConflict`
  true at 2.0.0, false at 3.0.0 with `coverageDiscrepancy` true) and the conflicting
  input of scenario 9 (same documents-plus-no-record change). Merge outputs for those
  inputs also changed as designed: coverage-only pairs moved from `disagreements`
  (`reported-vs-covered-no-record`) to `coverageDiscrepancies`.
- Unchanged assessment outputs: scenarios 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14 and
  both severity-conflict tests (same-source terms stay non-conflicting; cross-source
  differing terms stay conflicting).

Per-scenario approval status at 3.0.0:

- Carry forward unchanged at 3.0.0, no renewed sign-off required: scenarios 1, 2, 3, 4,
  6, 7, 8, 10, 11, 12, 13, 14 and the two severity-conflict tests. Scenario 4 was
  approved at 2.0.0 and its output is unchanged at 3.0.0, so that approval carries forward.
- Require renewed sign-off at 3.0.0: scenarios 5 and 9. Scenario 5 stays pending after the
  fix. Scenario 9 was approved at 2.0.0 for its wording rule, but its conflicting
  assessment output changed (conflict false with discrepancy true), so it requires renewal
  even though the wording guard still passes over all new outputs.

Superseded 2.0.0 statements:

- The 2.0.0 statement that documents-versus-no-record sets `evidenceConflict`
  ("remains true when one source documents an interaction and another has no record
  in coverage") is superseded by 3.0.0.
- The 2.0.0 `InteractionDisagreementReason` value `reported-vs-covered-no-record` and the
  merge rule deriving a disagreement from reported-versus-covered-no-record are superseded;
  coverage differences are now `coverageDiscrepancies`, never `disagreements`.

Boundaries: this sign-off does not approve a live provider, a medication database,
severity mappings, dosing rules or public clinical release. All fixtures remain synthetic;
provider selection, source rights, reviewed ingredient and severity mappings, real-provider
clinical validation and M10 presentation remain open.

## Owner sign-off round 3 (2026-10-14) and assessment logic 4.0.0

Owner decisions (surgeon, clinical reviewer), 2026-10-14, round 3:

- Scenario 9 at logic 3.0.0: **APPROVED.** The renewed safety-wording behaviour is
  accepted. Its approval history above is preserved, and InterMED never generates
  unsupported "safe" or "no interaction" conclusions.
- Scenario 5 at logic 3.0.0: **CHANGES REQUIRED.** Two adapters that reference the same
  underlying clinical source must not be treated as independent clinical sources.
  Cross-source clinical disagreements must be distinguished from within-source data
  inconsistencies, and a genuine cross-source coverage discrepancy must require distinct
  underlying source identities. Scenario 5 is implemented in 4.0.0 below and stays
  **pending** owner approval after this work; its approval is not recorded.

What changed in 4.0.0 (`INTERACTION_ASSESSMENT_LOGIC_VERSION = '4.0.0'`, exported from `@intermed/domain`):

- Source identity is `sourceId` (`DataSourceId`). Different `providerId` values or
  different `sourceVersion` values with the same `sourceId` are the same source.
- `merge.ts`: `severityTermsDifferAcrossProviders` is renamed to
  `severityTermsDifferAcrossSources` and reports `'severity-terms-differ'` in
  `disagreements` only when two terms with different `sourceId` differ.
  `deriveCoverageDiscrepancies` creates an entry only when a documenting source and a
  no-record source have different `sourceId`, and `documentingSources` /
  `noRecordSources` are restricted to the sources that form the cross-source pair.
- `merge.ts`: `MergedProviderResults` gains
  `withinSourceInconsistencies: readonly InteractionWithinSourceInconsistency[]`, one
  entry per pair and `sourceId`, each with `pair`, `sourceId`,
  `reasons` (`'severity-terms-differ'` and/or `'reported-vs-covered-no-record'`) and
  `entries` (`{ providerId, sourceId, sourceVersion, status, severity? }[]` provenance),
  sorted deterministically and deep-frozen.
- `assessment.ts`: `coverageDiscrepancy` requires a `documents-interaction` position and
  a `no-record-in-coverage` position with different `sourceId` (validated positions, not
  the merge-level list). `hasCrossSourceSeverityConflict` still compares `sourceId`.
- `assessment.ts`: `evidence` gains
  `withinSourceInconsistencies: readonly { sourceId; reasons; sourceVersions }[]`,
  derived only from the validated positions and records for the pair, for every input
  shape; the merge-level list is provenance and is never copied into the assessment. A
  within-source inconsistency never sets `evidenceConflict` or `coverageDiscrepancy`,
  never suppresses a documented finding, and is never phrased as safety or absence. A
  code comment records why source identity, not provider identity, defines independent
  clinical evidence.
- `types.ts` and exports: the new types and fields are added.
- The meaning of `evidenceConflict` and `coverageDiscrepancy` narrows and new fields are
  added. Everything stays deterministic and deeply frozen.

Definitions:

- Source identity: the underlying clinical source, identified by `sourceId`.
- Cross-source clinical conflict: differing severity terms for current records from
  different `sourceId` values (or a merged clinical disagreement for the pair).
- Cross-source coverage discrepancy: one `sourceId` documents the pair while a different
  `sourceId` covers it with no record.
- Within-source inconsistency: the same `sourceId` gives different severity terms via
  different providers or versions, or reports the pair through one provider or version
  while covering it with no record through another. It is kept separately with
  provenance and never treated as independent clinical evidence.

Scenario 5 tests at 4.0.0 (`tests/domain/interaction-source-identity.test.ts`, synthetic only):

- Same `sourceId`, two providers, different severity terms: `evidenceConflict` false,
  within-source `'severity-terms-differ'` with both providers' provenance, documented
  finding visible.
- Different `sourceId`, different severity terms: `evidenceConflict` true (unchanged).
- Same `sourceId`, one provider reports and another gives no record:
  `coverageDiscrepancy` false, within-source `'reported-vs-covered-no-record'`,
  documented finding visible.
- Different `sourceId`, one documents and the other gives no record:
  `coverageDiscrepancy` true (unchanged).
- Mixed (source S1 via two providers documenting and no-record, plus source S2
  no-record): `coverageDiscrepancy` true (S1 versus S2) with S1's within-source entry
  listed.
- Same `sourceId` with different `sourceVersion`: treated as the same source.
- Provider order never changes results.
- Merge level: `disagreements` and `coverageDiscrepancies` contain no same-source
  entries; `withinSourceInconsistencies` lists them.
- Scenario 9 wording guard (no `safe` / `no interaction` / `affirm`) holds over every
  new output.
- `logicVersion === '4.0.0'` on every path.

Renewal comparison (throwaway, not committed):

- A throwaway collector ran every scenario 1-14 input plus the two severity tests under
  3.0.0 (`origin/main`) and 4.0.0, comparing assessment and merge outputs while ignoring
  only `logicVersion` and the new `withinSourceInconsistencies` field when it is empty.
- Identical (ignoring only those fields): the two severity tests, scenario 1 assessment,
  scenarios 2, 3, 4, 5a assessment, 5c conflict without no-record, 5d, 5e assessment, 5f,
  all scenario 6 cases, scenarios 7, 8, 9 (all five assessments), 10, 11, 12, 13 and 14.
  Merge outputs for the identical cross-source cases are likewise identical once the
  empty new field is ignored.
- Changed assessment output: scenario 5b (two documenting same-term providers plus a
  no-record provider, all sharing one `sourceId`): `evidence.coverageDiscrepancy` true
  at 3.0.0, false at 4.0.0, with a new non-empty
  `evidence.withinSourceInconsistencies` entry
  (`sourceId` the shared source, `reasons: ["reported-vs-covered-no-record"]`,
  `sourceVersions: ["synthetic-interactions-v1", "synthetic-scenario5-v1"]`). Positions,
  finding, currency, coverage status and provenance are unchanged.
- Changed merge output for scenario 5b: `coverageDiscrepancies` has one entry at 3.0.0
  (both documenting providers versus the no-record provider) and is empty at 4.0.0; a new
  `withinSourceInconsistencies` entry lists the same source with reason
  `'reported-vs-covered-no-record'` and three provenance entries (two `reported` with
  `source-band-amber`, one `covered-no-record`).
- Changed merge output for scenario 5c with no-record (offline documents, disagreement
  documents with a different `sourceId`, no-record shares the offline `sourceId`):
  assessment flags are unchanged (`evidenceConflict` true, `coverageDiscrepancy` true)
  with a new non-empty within-source entry for the shared source; the merge
  `coverageDiscrepancies` `documentingSources` narrows from both documenting providers at
  3.0.0 to only the cross-source documenting provider at 4.0.0
  (`synthetic-disagreement-provider` versus `synthetic-covered-no-record-provider`),
  and the same-source documenting/no-record pair moves to `withinSourceInconsistencies`
  with reason `'reported-vs-covered-no-record'`.
- Scenario 9 conflicting assessment and merge outputs are identical at 3.0.0 and 4.0.0
  (conflict false with discrepancy true for the documents-plus-no-record input across
  different sources); only the empty new field differs and is ignored.

Per-scenario approval status at 4.0.0:

- Carry forward at 4.0.0, no renewed sign-off required: scenarios 1, 2, 3, 4, 6, 7, 8, 9,
  10, 11, 12, 13, 14 and the two severity-conflict tests. Scenario 9 was approved at
  3.0.0 and its output is unchanged at 4.0.0, so that approval carries forward. Scenario
  4 (approved at 2.0.0) remains unchanged and carries forward.
- Require sign-off at 4.0.0: scenario 5. It stays pending after the fix. The exact
  outputs requiring re-approval are the scenario 5b assessment and merge outputs quoted
  above (coverage `true` to `false` with the new within-source entry) and the scenario
  5c merge narrowing (same-source pair moved out of `documentingSources` into
  `withinSourceInconsistencies`). Scenario 9 needs no renewed sign-off at 4.0.0.

Superseded 3.0.0 statements:

- The 3.0.0 provider-identity rule that `severity-terms-differ` requires terms from
  different providers is superseded: it now requires different `sourceId` values.
- The 3.0.0 merge rule deriving a `coverageDiscrepancies` entry from any documenting
  provider beside any no-record provider is superseded: it now requires different
  `sourceId` values and restricts both source lists to the cross-source pair.
- The 3.0.0 assessment rule that any coexisting `documents-interaction` and
  `no-record-in-coverage` positions set `coverageDiscrepancy` is superseded: it now
  requires different `sourceId` values.
- The 3.0.0 scenario 5 expectation that same-term documenting providers beside a
  no-record provider from the same underlying source produce a coverage discrepancy is
  superseded: that case is now a within-source inconsistency with no coverage
  discrepancy.

Boundaries: this sign-off does not approve a live provider, a medication database,
severity mappings, dosing rules or public clinical release. All fixtures remain synthetic;
provider selection, source rights, reviewed ingredient and severity mappings, real-provider
clinical validation and M10 presentation remain open.

## Owner sign-off (2026-10-20): scenario 5 at logic 4.0.0

On 2026-10-20 the project owner (surgeon, clinical reviewer) wrote: "approve scenario 5 at
4.0.0 as the best practices you can find". **Scenario 5 is therefore approved at
assessment logic 4.0.0**, for the synthetic-data development scope only.

The evidence below was presented to the owner before approval:

- **A missing record is not evidence against a documented interaction.** Drug-interaction
  compendia overlap poorly. Abarca et al. examined interactions rated "major" by at least
  one of four compendia: 71.7% were listed in only one compendium, 2.2% in all four, and
  the intraclass correlation was −0.092. Comparisons of other compendia also report weak
  agreement on severity and evidence ratings. A covered source with no record therefore
  stays a neutral observation: it is `no-record-in-coverage`, it may raise
  `coverageDiscrepancy`, and it never becomes an `evidenceConflict` or a negative finding.
- **Only independent sources can corroborate or conflict.** Two adapters, or two versions,
  of the same underlying source are not independent evidence. Counting them twice would
  inflate both apparent agreement and apparent conflict. Logic 4.0.0 therefore keys
  clinical conflict and coverage discrepancy on `sourceId`. It reports same-source
  mismatches separately as within-source inconsistencies, each with its provenance.
- **Severity stays source-native.** A difference in severity terms between sources is
  shown as a conflict. It is never resolved into a single InterMED severity, because
  severity ratings are not interchangeable between compendia.

References:

- Abarca J, Malone DC, Armstrong EP, et al. Concordance of severity ratings provided in
  four drug interaction compendia. J Am Pharm Assoc. 2004;44(2):136–141.
- Comparisons of drug interaction compendia reporting weak agreement on severity and
  evidence ratings: PMC3660128; PMC4334009.

Scenario status at logic 4.0.0: **all scenarios 1–14 and both severity-conflict tests are
owner-approved.** The boundaries above still apply. This approves assessment behaviour
only: it does not approve a live provider, a medication database, severity mappings,
dosing rules, public clinical release or M10 presentation.
