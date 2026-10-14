import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  InteractionEvaluation,
  LocalDatasetGeneration,
  MedicationSearchMatch,
  PairAssessment,
} from '@intermed/domain';
import { assessInteractionPair } from '@intermed/domain';
import type { MedicationSearchService } from '../application/medication-search';
import {
  InteractionCheckerGenerationChangedError,
  INTERACTION_CHECKER_MAX_PAIRS,
  SyntheticPreviewRequiresSyntheticCatalogueError,
} from '../application/interaction-checker';
import type { InteractionCheckerService } from '../application/interaction-checker-contract';
import { useRouteHeadingFocus } from './route-focus';

const SEARCH_DEBOUNCE_MS = 200;
const ABSENCE_WARNING =
  'Absence of a record does not mean the combination is safe.';

interface SelectedProduct {
  readonly id: string;
  readonly name: string;
  readonly ingredientNames: readonly string[];
}

interface SearchState {
  readonly generationId: string;
  readonly query: string;
  readonly response: Awaited<ReturnType<MedicationSearchService['search']>>;
  readonly status: 'ready' | 'error';
}

interface EvaluationState {
  readonly generationId: string;
  readonly productIds: readonly string[];
  readonly evaluation: InteractionEvaluation;
}

type RequestState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly message: string };

function generationOf(
  state: DatasetUpdateState,
): LocalDatasetGeneration | null {
  return 'generation' in state ? state.generation : null;
}

function productName(
  productId: string | undefined,
  selectedProducts: readonly SelectedProduct[],
): string | undefined {
  return selectedProducts.find((product) => product.id === productId)?.name;
}

/** Stable ids use U+001F separators; JSON displays that control character visibly. */
function identifierText(value: string): string {
  return JSON.stringify(value);
}

function namedProduct(
  productId: string | undefined,
  selectedProducts: readonly SelectedProduct[],
): string {
  if (!productId) return 'Product not identified';
  const name = productName(productId, selectedProducts);
  return name
    ? `${name} (${identifierText(productId)})`
    : identifierText(productId);
}

function sourcePositionText(
  position: PairAssessment['evidence']['positions'][number],
) {
  return `${identifierText(position.sourceId)} · version ${position.sourceVersion}: ${position.position}`;
}

function formatSourceSeverity(
  item: PairAssessment['finding']['sourceSeverities'][number],
  evaluation: InteractionEvaluation,
): string {
  const term = item.severityTerm
    ? `Source term: ${item.severityTerm}.`
    : 'Source severity term not supplied.';
  const review = evaluation.severityMappingReview;
  if (review)
    return `${identifierText(item.sourceId)} · version ${item.sourceVersion}. ${term} Mapping version ${review.mappingVersion}; ${item.severityMappingReviewed === true ? 'reviewed' : 'unreviewed mapping'}.`;
  if (item.severityMappingReviewed === true)
    return `${identifierText(item.sourceId)} · version ${item.sourceVersion}. ${term} Mapping version not supplied; the source marks the mapping reviewed.`;
  return `${identifierText(item.sourceId)} · version ${item.sourceVersion}. ${term} Mapping version not supplied; unreviewed mapping.`;
}

function AssessmentDimension({
  pairNumber,
  assessment,
  evaluation,
  selectedProducts,
}: {
  pairNumber: number;
  assessment: PairAssessment;
  evaluation: InteractionEvaluation;
  selectedProducts: readonly SelectedProduct[];
}) {
  const sourcePositions = assessment.evidence.positions;
  const affirmativeSources = sourcePositions.filter(
    (position) => position.position === 'affirms-none',
  );
  const mapping = evaluation.selectedProductToIngredientMappings.find((item) =>
    item.ingredientIds.includes(assessment.pair[0]),
  );
  const noActiveRecord = !assessment.finding.documentedInteraction;

  return (
    <section
      className="interaction-pair"
      aria-label={`Ingredient pair ${pairNumber} assessment`}
    >
      <h3>Ingredient pair {pairNumber}</h3>
      <p className="interaction-pair-identifiers">
        Canonical pair: <code>{identifierText(assessment.pair[0])}</code> +{' '}
        <code>{identifierText(assessment.pair[1])}</code>
      </p>
      {mapping && productName(mapping.productId, selectedProducts) && (
        <p>
          One mapped product: {productName(mapping.productId, selectedProducts)}
        </p>
      )}

      <dl className="interaction-dimensions">
        <div>
          <dt>Finding</dt>
          <dd>
            {assessment.finding.documentedInteraction ? (
              <p>A current source record documents an interaction.</p>
            ) : assessment.finding.affirmedNoInteraction ? (
              <ul>
                {affirmativeSources.map((position) => (
                  <li key={`${position.sourceId}-${position.sourceVersion}`}>
                    Source {position.sourceId} version {position.sourceVersion}{' '}
                    states no interaction is expected.
                  </li>
                ))}
              </ul>
            ) : (
              <p>No active interaction record is reported for this pair.</p>
            )}
            {assessment.finding.sourceSeverities.length > 0 && (
              <ul>
                {assessment.finding.sourceSeverities.map((item) => (
                  <li key={`${item.sourceId}-${item.recordId}`}>
                    {formatSourceSeverity(item, evaluation)} Record id:{' '}
                    {item.recordId}.
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            <p>
              Evidence conflict:{' '}
              {assessment.evidence.evidenceConflict ? 'yes' : 'no'}.
            </p>
            <p>
              Source-stated uncertainty:{' '}
              {assessment.evidence.sourceStatedUncertainty ? 'yes' : 'no'}.
            </p>
            <ul>
              {sourcePositions.map((position) => (
                <li
                  key={`${position.sourceId}-${position.sourceVersion}-${position.position}`}
                >
                  {sourcePositionText(position)}
                </li>
              ))}
              {assessment.evidence.evidenceLevels.map((level) => (
                <li key={`${level.sourceId}-${level.recordId}`}>
                  Evidence level from {level.sourceId}; record {level.recordId}:{' '}
                  {level.evidenceLevel ?? 'not supplied'}.
                </li>
              ))}
              {sourcePositions.length === 0 &&
                assessment.evidence.evidenceLevels.length === 0 && (
                  <li>No evidence position or level was returned.</li>
                )}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>
            <p>
              Current record ids:{' '}
              {assessment.currency.currentRecordIds.join(', ') ||
                'none returned'}
              .
            </p>
            <p>
              Historical record ids:{' '}
              {assessment.currency.historicalRecordIds.join(', ') ||
                'none returned'}
              .
            </p>
            <p>
              Outdated record ids:{' '}
              {assessment.currency.outdatedRecordIds.join(', ') ||
                'none returned'}
              .
            </p>
          </dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>
            <p>Pair coverage: {assessment.coverage.status}.</p>
            <p>
              Pair coverage complete:{' '}
              {assessment.coverage.coverageComplete ? 'yes' : 'no'}.
            </p>
            <p>
              Pair coverage reasons:{' '}
              {assessment.coverage.reasons.join(', ') || 'none returned'}.
            </p>
          </dd>
        </div>
      </dl>

      {noActiveRecord && (
        <p className="interaction-absence-warning" role="note">
          {ABSENCE_WARNING}
        </p>
      )}

      <h4>Provenance</h4>
      {assessment.provenance.length > 0 ? (
        <ul className="interaction-provenance">
          {assessment.provenance.map((item) => (
            <li key={`${item.sourceId}-${item.sourceVersion}-${item.recordId}`}>
              {identifierText(item.sourceId)} · source version{' '}
              {item.sourceVersion} · record {item.recordId} · catalogue version{' '}
              {identifierText(item.datasetVersionId)}
              {item.retrievedAt ? ` · retrieved ${item.retrievedAt}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>No record-level provenance was returned.</p>
      )}
    </section>
  );
}

function EvaluationLimitations({
  evaluation,
  selectedProducts,
}: {
  evaluation: InteractionEvaluation;
  selectedProducts: readonly SelectedProduct[];
}) {
  const inactiveRecords = evaluation.inactiveRecords;
  const disagreements = evaluation.disagreements ?? [];
  const hasLimitations =
    !evaluation.coverageComplete ||
    evaluation.incompleteReasons.length > 0 ||
    evaluation.unresolvedInputs.length > 0 ||
    evaluation.duplicateExposure.length > 0 ||
    evaluation.pairLimit !== undefined ||
    evaluation.unavailableReason !== undefined ||
    disagreements.length > 0 ||
    inactiveRecords.length > 0;
  if (!hasLimitations) return null;

  return (
    <section
      className="interaction-limitations"
      aria-labelledby="interaction-limitations-title"
    >
      <h2 id="interaction-limitations-title">Evaluation limitations</h2>
      {!evaluation.coverageComplete && (
        <p>
          Coverage is incomplete. This evaluation does not establish complete
          source coverage.
        </p>
      )}
      {evaluation.incompleteReasons.length > 0 && (
        <div>
          <h3>Incomplete reasons</h3>
          <ul>
            {evaluation.incompleteReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {evaluation.unresolvedInputs.length > 0 && (
        <div>
          <h3>Unresolved inputs</h3>
          <ul>
            {evaluation.unresolvedInputs.map((input, index) => (
              <li
                key={`${input.productId ?? ''}-${input.joinId ?? ''}-${input.ingredientId ?? ''}-${input.reason}-${index}`}
              >
                {input.productId &&
                  `Product ${namedProduct(input.productId, selectedProducts)}; `}
                {input.joinId &&
                  `ingredient join ${identifierText(input.joinId)}; `}
                {input.ingredientId &&
                  `ingredient ${identifierText(input.ingredientId)}; `}
                reason: {input.reason}.
              </li>
            ))}
          </ul>
        </div>
      )}
      {evaluation.duplicateExposure.length > 0 && (
        <div>
          <h3>Duplicate ingredient exposure</h3>
          <ul>
            {evaluation.duplicateExposure.map((duplicate) => (
              <li key={duplicate.ingredientId}>
                Ingredient {identifierText(duplicate.ingredientId)} is present
                through{' '}
                {duplicate.productIds
                  .map((productId) => namedProduct(productId, selectedProducts))
                  .join('; ')}
                {duplicate.directInput ? ' and a direct ingredient input' : ''}.
              </li>
            ))}
          </ul>
        </div>
      )}
      {evaluation.pairLimit && (
        <p>
          Too many ingredient pairs: {evaluation.pairLimit.pairCount} requested;
          limit {evaluation.pairLimit.maxPairs}. No pairs were evaluated.
        </p>
      )}
      {evaluation.unavailableReason && (
        <p>
          {evaluation.unavailableReason === 'online-required'
            ? 'The configured online-only provider is unavailable while the browser is offline.'
            : 'Provider unavailable.'}{' '}
          Reason: {evaluation.unavailableReason}.
        </p>
      )}
      {disagreements.length > 0 && (
        <div>
          <h3>Source disagreements</h3>
          <ul>
            {disagreements.map((disagreement, index) => (
              <li key={`${disagreement.pair.join('-')}-${index}`}>
                Pair {identifierText(disagreement.pair[0])} +{' '}
                {identifierText(disagreement.pair[1])}: reasons{' '}
                {disagreement.reasons.join(', ')}. Source terms:{' '}
                {disagreement.severityTerms
                  .map(
                    (term) =>
                      `${identifierText(term.sourceId)} version ${term.sourceVersion}: ${term.severity}`,
                  )
                  .join('; ')}
                .
              </li>
            ))}
          </ul>
        </div>
      )}
      {inactiveRecords.length > 0 && (
        <p>
          {inactiveRecords.length} superseded or withdrawn record(s) were
          returned as history. They are not active findings; details are below.
        </p>
      )}
    </section>
  );
}

function EvaluationResults({
  evaluation,
  selectedProducts,
}: {
  evaluation: InteractionEvaluation;
  selectedProducts: readonly SelectedProduct[];
}) {
  return (
    <section
      className="interaction-evaluation"
      aria-labelledby="interaction-evaluation-title"
    >
      <h2 id="interaction-evaluation-title">Interaction evaluation</h2>
      <p>Engine result status: {evaluation.status}.</p>
      <EvaluationLimitations
        evaluation={evaluation}
        selectedProducts={selectedProducts}
      />

      <section
        className="interaction-resolution"
        aria-labelledby="interaction-resolution-title"
      >
        <h3 id="interaction-resolution-title">
          Product to ingredient resolution
        </h3>
        {evaluation.selectedProductToIngredientMappings.length > 0 ? (
          <ul>
            {evaluation.selectedProductToIngredientMappings.map((mapping) => (
              <li key={mapping.productId}>
                {namedProduct(mapping.productId, selectedProducts)} resolves to:{' '}
                {mapping.ingredientIds.map(identifierText).join(', ') ||
                  'no resolved ingredient ids'}
                .
              </li>
            ))}
          </ul>
        ) : (
          <p>No product-to-ingredient mappings were returned.</p>
        )}
        <p>
          Direct ingredient ids:{' '}
          {evaluation.directIngredientIds.map(identifierText).join(', ') ||
            'None supplied.'}
        </p>
      </section>

      {evaluation.sourceVersions.length > 0 && (
        <section aria-labelledby="interaction-source-versions-title">
          <h3 id="interaction-source-versions-title">
            Provider and source versions
          </h3>
          <ul>
            {evaluation.sourceVersions.map((source) => (
              <li
                key={`${source.providerId}-${source.sourceId}-${source.sourceVersion}`}
              >
                {source.providerId} · {identifierText(source.sourceId)} ·
                version {source.sourceVersion}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evaluation.inactiveRecords.length > 0 && (
        <section
          className="interaction-history"
          aria-labelledby="interaction-history-title"
        >
          <h3 id="interaction-history-title">Historical interaction records</h3>
          <p>
            Superseded and withdrawn records are history, not active findings.
          </p>
          <ul>
            {evaluation.inactiveRecords.map(({ record, reason }) => (
              <li key={record.id}>
                {reason}: record {record.id} · source{' '}
                {identifierText(record.sourceId)} · version{' '}
                {record.sourceVersion} · dataset version{' '}
                {identifierText(record.datasetVersionId)}
                {record.supersededBy
                  ? ` · superseded by ${record.supersededBy}`
                  : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evaluation.evaluatedPairCoverage.length > 0 ? (
        <ol className="interaction-pair-list" aria-label="Pair assessments">
          {evaluation.evaluatedPairCoverage.map((coverage, index) => (
            <li key={JSON.stringify(coverage.pair)}>
              <AssessmentDimension
                pairNumber={index + 1}
                assessment={assessInteractionPair(evaluation, coverage.pair)}
                evaluation={evaluation}
                selectedProducts={selectedProducts}
              />
            </li>
          ))}
        </ol>
      ) : (
        !evaluation.pairLimit && (
          <p>
            No ingredient pair assessments were returned by the domain engine.
          </p>
        )
      )}
    </section>
  );
}

function productFromMatch(match: MedicationSearchMatch): SelectedProduct {
  return {
    id: match.record.product.id,
    name: match.record.product.commercialName,
    ingredientNames: match.record.ingredientNames,
  };
}

/**
 * Local, nonclinical interaction preview. Selections and evaluations live only
 * in component memory and are cleared when the active dataset changes or the
 * route unmounts.
 */
export function InteractionCheckerPage({
  dataset,
  search,
  checker,
  online,
}: {
  dataset: DatasetStateSource;
  search: MedicationSearchService;
  checker: InteractionCheckerService;
  online: boolean;
}) {
  const datasetState = useSyncExternalStore(
    dataset.subscribe,
    dataset.getState,
  );
  const generation = generationOf(datasetState);
  const generationId = generation?.generationId ?? null;
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(
    [],
  );
  const [evaluationState, setEvaluationState] =
    useState<EvaluationState | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({
    status: 'idle',
  });
  const [retryRevision, setRetryRevision] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestRevision = useRef(0);
  const previousGenerationId = useRef(generationId);

  useRouteHeadingFocus();

  useEffect(() => {
    if (previousGenerationId.current === generationId) return;
    previousGenerationId.current = generationId;
    requestRevision.current += 1;
    setSelectedProducts([]);
    setEvaluationState(null);
    setSearchState(null);
    setRequestState({ status: 'idle' });
  }, [generationId]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (
      checker.availability !== 'synthetic-preview' ||
      !generation?.synthetic ||
      !generationId ||
      !normalizedQuery
    )
      return;

    let current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void search.search(normalizedQuery, controller.signal).then(
        (response) => {
          if (
            !current ||
            controller.signal.aborted ||
            response.generationId !== generationId
          )
            return;
          setSearchState({
            generationId,
            query: normalizedQuery,
            response,
            status: 'ready',
          });
        },
        () => {
          if (!current || controller.signal.aborted) return;
          setSearchState({
            generationId,
            query: normalizedQuery,
            response: {
              generationId,
              results: [],
              total: 0,
              truncated: false,
              indexedProductCount: 0,
              indexDurationMilliseconds: 0,
              searchDurationMilliseconds: 0,
            },
            status: 'error',
          });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    checker,
    generation?.synthetic,
    generationId,
    query,
    retryRevision,
    search,
  ]);

  const currentSearch =
    searchState?.generationId === generationId &&
    searchState.query === query.trim()
      ? searchState
      : null;
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const candidates =
    currentSearch?.status === 'ready'
      ? currentSearch.response.results.filter(
          (match) => !selectedIds.has(match.record.product.id),
        )
      : [];
  const currentEvaluation =
    evaluationState?.generationId === generationId &&
    evaluationState.productIds.join('\u001f') ===
      selectedProducts.map((product) => product.id).join('\u001f')
      ? evaluationState.evaluation
      : null;

  function addProduct(match: MedicationSearchMatch) {
    const product = productFromMatch(match);
    setSelectedProducts((current) =>
      current.some((item) => item.id === product.id)
        ? current
        : [...current, product],
    );
    setEvaluationState(null);
    setRequestState({ status: 'idle' });
  }

  function removeProduct(productId: string) {
    requestRevision.current += 1;
    setSelectedProducts((current) =>
      current.filter((product) => product.id !== productId),
    );
    setEvaluationState(null);
    setRequestState({ status: 'idle' });
  }

  async function evaluateSelection() {
    const productIds = selectedProducts.map((product) => product.id);
    if (productIds.length === 0) return;
    const revision = ++requestRevision.current;
    setEvaluationState(null);
    setRequestState({ status: 'loading' });
    try {
      const evaluation = await checker.evaluate(productIds, online);
      if (revision !== requestRevision.current) return;
      setEvaluationState({
        generationId: generationId ?? '',
        productIds,
        evaluation,
      });
      setRequestState({
        status: 'ready',
        message: `Evaluation complete. Coverage complete: ${evaluation.coverageComplete ? 'yes' : 'no'}.`,
      });
    } catch (error) {
      if (revision !== requestRevision.current) return;
      setRequestState({
        status: 'error',
        message:
          error instanceof SyntheticPreviewRequiresSyntheticCatalogueError
            ? 'The synthetic preview requires a synthetic catalogue. No evaluation was produced.'
            : error instanceof InteractionCheckerGenerationChangedError
              ? 'The active dataset changed. Select products from the active catalogue again.'
              : 'The interaction preview could not be completed. No result was stored.',
      });
    }
  }

  const checkerUnavailable = checker.availability === 'unavailable';
  const syntheticPreviewReady =
    checker.availability === 'synthetic-preview' &&
    generation?.synthetic === true;

  return (
    <section
      className="interaction-checker-page"
      aria-labelledby="interaction-checker-title"
      data-testid="interaction-checker-page"
    >
      <h1 id="interaction-checker-title" ref={headingRef} tabIndex={-1}>
        Check interactions
      </h1>
      <p className="lead">
        {checker.availability === 'unavailable'
          ? 'No approved interaction source is configured, so interaction checking is unavailable.'
          : 'Select products from the local synthetic catalogue to inspect a development-only result. This feature does not support care decisions.'}
      </p>
      <p className="interaction-preview-banner" role="note">
        Development preview — not for clinical use. No interaction source has
        been approved.
      </p>

      {checkerUnavailable ? (
        <p className="interaction-unavailable" role="status" aria-live="polite">
          Interaction checking is unavailable. No approved interaction source is
          configured.
        </p>
      ) : !generation ? (
        <p className="interaction-unavailable" role="status" aria-live="polite">
          A synthetic local catalogue generation is required for the development
          preview. No approved interaction source is configured.
        </p>
      ) : !generation.synthetic ? (
        <p className="interaction-unavailable" role="status" aria-live="polite">
          The synthetic preview is disabled for this non-synthetic catalogue. No
          approved interaction source is configured.
        </p>
      ) : (
        <>
          <p className="interaction-work-limit">
            The preview evaluates at most {INTERACTION_CHECKER_MAX_PAIRS}{' '}
            ingredient pairs. Selections over that limit stop without
            truncation.
          </p>

          <div className="search-control">
            <label htmlFor="interaction-medication-search">
              Search local medications to add
            </label>
            <input
              id="interaction-medication-search"
              type="search"
              value={query}
              autoComplete="off"
              aria-describedby="interaction-medication-search-help"
              onChange={(event) => {
                setSearchState(null);
                setEvaluationState(null);
                setRequestState({ status: 'idle' });
                setQuery(event.currentTarget.value);
              }}
            />
            <p id="interaction-medication-search-help">
              Search uses only this browser&apos;s active synthetic dataset.
              Your selection and result stay in memory for this page and are not
              saved.
            </p>
          </div>

          <p
            className="search-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {query.trim() === ''
              ? 'Search for a local product to add it to the selection.'
              : currentSearch?.status === 'error'
                ? 'Local medication search is unavailable. Try the search again.'
                : currentSearch?.status === 'ready'
                  ? `${currentSearch.response.total} local candidate(s) found.`
                  : 'Searching the active local catalogue.'}
          </p>
          {currentSearch?.status === 'error' && (
            <button
              type="button"
              onClick={() => {
                setSearchState(null);
                setRetryRevision((current) => current + 1);
              }}
            >
              Retry local search
            </button>
          )}
          {currentSearch?.status === 'ready' &&
            currentSearch.response.truncated && (
              <p role="note">
                The local search result list is limited. Refine the query to
                find another product.
              </p>
            )}
          {candidates.length > 0 && (
            <ul
              className="interaction-candidate-list"
              aria-label="Medication search candidates"
            >
              {candidates.map((match) => {
                const candidate = productFromMatch(match);
                return (
                  <li key={candidate.id}>
                    <div>
                      <h2>{candidate.name}</h2>
                      <p>
                        Active ingredient(s):{' '}
                        {candidate.ingredientNames.join(', ') ||
                          'not resolved by search'}
                      </p>
                      <p>Product id: {identifierText(candidate.id)}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${candidate.name}`}
                      onClick={() => addProduct(match)}
                    >
                      Add
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <section
            className="interaction-selection"
            aria-labelledby="interaction-selection-title"
          >
            <h2 id="interaction-selection-title">Selected products</h2>
            {selectedProducts.length > 0 ? (
              <ul>
                {selectedProducts.map((product) => (
                  <li key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <p>Product id: {identifierText(product.id)}</p>
                      <p>
                        Search ingredient name(s):{' '}
                        {product.ingredientNames.join(', ') ||
                          'not resolved by search'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${product.name} from selection`}
                      onClick={() => removeProduct(product.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No products selected.</p>
            )}
          </section>

          <button
            type="button"
            disabled={
              selectedProducts.length === 0 || requestState.status === 'loading'
            }
            onClick={() => void evaluateSelection()}
          >
            Check selected products
          </button>

          <p
            className="interaction-request-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {requestState.status === 'loading'
              ? 'Checking the selected synthetic products.'
              : requestState.status === 'error' ||
                  requestState.status === 'ready'
                ? requestState.message
                : 'No interaction evaluation has been run.'}
          </p>
          {currentEvaluation && (
            <EvaluationResults
              evaluation={currentEvaluation}
              selectedProducts={selectedProducts}
            />
          )}
        </>
      )}
      {!checkerUnavailable &&
        !syntheticPreviewReady &&
        generation?.synthetic && (
          <p
            className="interaction-unavailable"
            role="status"
            aria-live="polite"
          >
            A synthetic preview provider is not available in this build. No
            approved interaction source is configured.
          </p>
        )}
    </section>
  );
}
