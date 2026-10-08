import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  LocalDatasetGeneration,
} from '@intermed/domain';
import type {
  MedicationSearchResponse,
  MedicationSearchService,
} from '../application/medication-search';
import { datasetAgeText } from './dataset-age';
import { getSearchStatusMessage } from './search-status';
import type { SearchStatus } from './search-status';
import {
  createDisambiguatedSearchResults,
  type DisambiguatedSearchResult,
} from './search-disambiguation';

const SEARCH_DEBOUNCE_MS = 200;
type SearchState =
  | {
      status: 'success';
      query: string;
      generationId: string;
      retryRevision: number;
      revision: number;
      response: MedicationSearchResponse;
    }
  | {
      status: 'error';
      query: string;
      generationId: string;
      retryRevision: number;
      revision: number;
    };

function generationOf(
  state: DatasetUpdateState,
): LocalDatasetGeneration | null {
  return 'generation' in state ? state.generation : null;
}

function SearchResultDetails({ row }: { row: DisambiguatedSearchResult }) {
  return (
    <dl className="search-result-details">
      <div>
        <dt>Active ingredient(s)</dt>
        <dd>{row.ingredients}</dd>
      </div>
      <div>
        <dt>Strength</dt>
        <dd>{row.strength}</dd>
      </div>
      <div>
        <dt>Dosage form</dt>
        <dd>{row.dosageForm}</dd>
      </div>
      <div>
        <dt>Route</dt>
        <dd>{row.route}</dd>
      </div>
      <div>
        <dt>Authorization status</dt>
        <dd>{row.authorization}</dd>
      </div>
      <div>
        <dt>Manufacturer</dt>
        <dd>{row.manufacturer}</dd>
      </div>
      <div>
        <dt>Pack/presentation</dt>
        <dd>{row.pack}</dd>
      </div>
      <div>
        <dt>CIM</dt>
        <dd>{row.cim}</dd>
      </div>
      <div>
        <dt>Catalogue record status</dt>
        <dd>{row.catalogueStatus}</dd>
      </div>
      {row.sourceProductIdSuffix && (
        <div>
          <dt>Source product ID</dt>
          <dd>{row.sourceProductIdSuffix}</dd>
        </div>
      )}
      {row.productIdSuffix && (
        <div>
          <dt>Product ID</dt>
          <dd>{row.productIdSuffix}</dd>
        </div>
      )}
    </dl>
  );
}

function SearchResult({
  row,
  query,
}: {
  row: DisambiguatedSearchResult;
  query: string;
}) {
  const product = row.match.record.product;
  const path = `/medication/${encodeURIComponent(product.id)}`;
  const href = query.trim()
    ? {
        pathname: path,
        search: `?${new URLSearchParams({ q: query }).toString()}`,
      }
    : path;
  const sourceProductId = row.sourceProductIdSuffix
    ? `. Source product ID: ${row.sourceProductIdSuffix}`
    : '';
  const productId = row.productIdSuffix
    ? `. Product ID: ${row.productIdSuffix}`
    : '';

  return (
    <li className="search-result">
      <Link
        to={href}
        tabIndex={0}
        aria-label={`Open ${product.commercialName}. Active ingredient(s): ${row.ingredients}. Strength: ${row.strength}. Dosage form: ${row.dosageForm}. Route: ${row.route}. Authorization status: ${row.authorization}. Manufacturer: ${row.manufacturer}. Pack/presentation: ${row.pack}. CIM: ${row.cim}. Catalogue record status: ${row.catalogueStatus}${sourceProductId}${productId}.`}
      >
        <span className="search-result-name">{product.commercialName}</span>
        <SearchResultDetails row={row} />
      </Link>
    </li>
  );
}

/** Local-only nonclinical search through the active, pinned dataset generation. */
export function MedicationSearchPage({
  dataset,
  search,
}: {
  dataset: DatasetStateSource;
  search: MedicationSearchService;
}) {
  const state = useSyncExternalStore(dataset.subscribe, dataset.getState);
  const generation = generationOf(state);
  const generationId = generation?.generationId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestRevision = useRef(0);

  // Keep the settled query in the URL so the browser Back button restores it.
  // The write is debounced like the search itself and replaces the current
  // history entry, so typing never creates history entries.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (query.trim()) next.set('q', query);
          else next.delete('q');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query, setSearchParams]);

  useEffect(() => {
    const revision = ++requestRevision.current;
    const normalizedQuery = query.trim();
    if (!generationId || !normalizedQuery) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void search.search(query, controller.signal).then(
        (response) => {
          if (
            controller.signal.aborted ||
            revision !== requestRevision.current ||
            response.generationId !== generationId
          )
            return;
          setSearchState({
            status: 'success',
            query,
            generationId,
            retryRevision,
            revision,
            response,
          });
        },
        () => {
          if (controller.signal.aborted || revision !== requestRevision.current)
            return;
          setSearchState({
            status: 'error',
            query,
            generationId,
            retryRevision,
            revision,
          });
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [generationId, query, retryRevision, search]);

  const currentSearchState =
    searchState?.query === query &&
    searchState.generationId === generationId &&
    searchState.retryRevision === retryRevision
      ? searchState
      : null;
  const result =
    currentSearchState?.status === 'success'
      ? currentSearchState.response
      : null;
  const searchError = currentSearchState?.status === 'error';
  const statusSearch: SearchStatus = currentSearchState
    ? currentSearchState.status === 'error'
      ? { status: 'error' }
      : { status: 'success', response: currentSearchState.response }
    : generation && query.trim()
      ? { status: 'pending' }
      : null;
  const statusMessage = getSearchStatusMessage({
    datasetState: state,
    query,
    search: statusSearch,
  });

  return (
    <section
      className="medication-search-page"
      aria-labelledby="medication-search-title"
      data-testid="medication-search-page"
      data-search-revision={
        currentSearchState?.status === 'success'
          ? currentSearchState.revision
          : 0
      }
      data-index-duration-ms={result?.indexDurationMilliseconds ?? 0}
      data-index-product-count={result?.indexedProductCount ?? 0}
      data-search-duration-ms={result?.searchDurationMilliseconds ?? 0}
    >
      <h1 id="medication-search-title">Local medication search</h1>
      <p className="lead">
        Search candidates from the dataset stored in this browser. This is a
        development feature and does not support care decisions.
      </p>

      {generation && (
        <>
          <dl className="search-dataset-meta">
            <div>
              <dt>Active dataset version</dt>
              <dd>{generation.version}</dd>
            </div>
            <div>
              <dt>Downloaded</dt>
              <dd>
                {generation.downloadedAt} (
                {datasetAgeText(generation.downloadedAt)})
              </dd>
            </div>
          </dl>
          {generation.synthetic && (
            <p className="synthetic-label">
              Synthetic development data — not for clinical use.
            </p>
          )}
        </>
      )}

      <div className="search-control">
        <label htmlFor="local-medication-search">
          Search local medications by name, active ingredient, ATC code, or
          manufacturer
        </label>
        <input
          id="local-medication-search"
          type="search"
          value={query}
          disabled={!generation}
          autoComplete="off"
          aria-describedby="local-medication-search-help"
          onChange={(event) => {
            setSearchState(null);
            setQuery(event.currentTarget.value);
          }}
        />
        <p id="local-medication-search-help">
          Search reads only this browser’s active dataset. Your query is not
          sent to a server. Choose a result to continue; no product is selected
          automatically.
        </p>
      </div>

      <p
        className="search-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </p>
      {searchError && (
        <div className="search-error" role="alert">
          <p>
            Search is temporarily unavailable. Try again or check{' '}
            <Link to="/status">dataset status</Link>.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchState(null);
              setRetryRevision((current) => current + 1);
            }}
          >
            Retry search
          </button>
        </div>
      )}
      {!generation && (
        <p>
          <Link to="/status">Dataset status</Link>
        </p>
      )}
      {result && result.results.length > 0 && (
        <ol
          className="search-result-list"
          aria-label="Medication search results"
        >
          {createDisambiguatedSearchResults(result.results).map((row) => (
            <SearchResult
              key={row.match.record.product.id}
              row={row}
              query={query}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
