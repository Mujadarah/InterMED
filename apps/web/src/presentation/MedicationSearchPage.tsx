import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  LocalDatasetGeneration,
  RecentSearchEntry,
} from '@intermed/domain';
import type {
  MedicationSearchResponse,
  MedicationSearchService,
} from '../application/medication-search';
import { datasetAgeText } from './dataset-age';
import { getSearchStatusMessage } from './search-status';
import type { SearchStatus } from './search-status';
import type { PreferencesService } from '../application/preferences';
import { ConfirmationDialog } from './ConfirmationDialog';
import { useRouteHeadingFocus } from './route-focus';
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

interface RecentSearchLoad {
  readonly generationId: string;
  readonly queryRevision: number;
  readonly status: 'ready' | 'error';
  readonly entries: readonly RecentSearchEntry[];
}

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
  onActivate,
  onCancelPendingWrite,
}: {
  row: DisambiguatedSearchResult;
  query: string;
  onActivate: () => void;
  onCancelPendingWrite: () => void;
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
        onClick={onActivate}
        onKeyDown={(event) => {
          // Enter on a focused link also fires a click, which records the
          // search. Cancel the pending URL write here so navigation still
          // wins on the keyboard path, without recording twice.
          if (event.key === 'Enter') onCancelPendingWrite();
        }}
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
  preferences,
}: {
  dataset: DatasetStateSource;
  search: MedicationSearchService;
  preferences: PreferencesService;
}) {
  const state = useSyncExternalStore(dataset.subscribe, dataset.getState);
  const generation = generationOf(state);
  const generationId = generation?.generationId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const setSearchParamsRef = useRef(setSearchParams);
  const queryUrlSyncTimeout = useRef<number | null>(null);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const [recentLoad, setRecentLoad] = useState<RecentSearchLoad | null>(null);
  const [queryRevision, setQueryRevision] = useState(0);
  const [recentDialogOpen, setRecentDialogOpen] = useState(false);
  const [recentNotice, setRecentNotice] = useState('');
  const [recentError, setRecentError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestRevision = useRef(0);
  const hasQuery = query.trim().length > 0;
  const currentRecentLoad =
    generationId &&
    !hasQuery &&
    recentLoad?.generationId === generationId &&
    recentLoad.queryRevision === queryRevision
      ? recentLoad
      : null;
  const recentSearches = currentRecentLoad?.entries ?? [];
  const recentLoading = Boolean(
    generationId && !hasQuery && !currentRecentLoad,
  );

  // This route's chunk resolves after the App's pathname effect, so the heading
  // takes the pending route focus once it is in the document.
  useRouteHeadingFocus();

  // React Router hands out a new setSearchParams identity on every location
  // change, so the latest one is kept here instead of being a dependency of the
  // debounced URL write below.
  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  function cancelQueryUrlSync() {
    const timeout = queryUrlSyncTimeout.current;
    if (timeout === null) return;
    window.clearTimeout(timeout);
    queryUrlSyncTimeout.current = null;
  }

  // Keep the settled query in the URL so the browser Back button restores it.
  // The write is debounced like the search itself and replaces the current
  // history entry, so typing never creates history entries.
  //
  // The effect depends on the query alone. Route pages load lazily, so while a
  // detail chunk arrives React keeps this page mounted and the changing
  // location gives setSearchParams a new identity: depending on it would
  // reschedule this write, which would then navigate back to /search from the
  // page the user just opened. The pathname recorded when the debounce is
  // scheduled drops such a write, and opening a result cancels it outright.
  useEffect(() => {
    const pathnameAtSchedule = window.location.pathname;
    const timeout = window.setTimeout(() => {
      queryUrlSyncTimeout.current = null;
      if (window.location.pathname !== pathnameAtSchedule) return;
      setSearchParamsRef.current(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (query.trim()) next.set('q', query);
          else next.delete('q');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    queryUrlSyncTimeout.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      if (queryUrlSyncTimeout.current === timeout)
        queryUrlSyncTimeout.current = null;
    };
  }, [query]);

  useEffect(() => {
    if (!generationId || hasQuery) return;
    let current = true;
    void preferences.listRecentSearches().then(
      (entries) => {
        if (current)
          setRecentLoad({
            generationId,
            queryRevision,
            status: 'ready',
            entries,
          });
      },
      () => {
        if (current) {
          setRecentLoad({
            generationId,
            queryRevision,
            status: 'error',
            entries: [],
          });
          setRecentError(
            'Recent searches could not be read from this browser.',
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [generationId, hasQuery, preferences, queryRevision]);

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

  function recordOpenedSearch(datasetVersionId: string) {
    cancelQueryUrlSync();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    void preferences
      .recordOpenedSearch(trimmedQuery, datasetVersionId)
      .catch(() => {
        setRecentError('Recent search could not be saved in this browser.');
      });
  }

  async function clearRecentSearches() {
    try {
      await preferences.clearRecentSearches();
      setRecentDialogOpen(false);
      if (generationId)
        setRecentLoad({
          generationId,
          queryRevision,
          status: 'ready',
          entries: [],
        });
      setRecentNotice('Recent searches cleared.');
      setRecentError('');
    } catch {
      setRecentDialogOpen(false);
      setRecentError('Recent searches could not be cleared from this browser.');
    }
  }

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
      <h1 id="medication-search-title" ref={headingRef} tabIndex={-1}>
        Local medication search
      </h1>
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
            setRecentError('');
            setRecentNotice('');
            setQueryRevision((revision) => revision + 1);
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
      {generation && !hasQuery && (
        <section
          className="recent-search-panel"
          aria-labelledby="recent-search-title"
        >
          <h2 id="recent-search-title">Recent searches</h2>
          {recentNotice && (
            <p className="preferences-status" role="status" aria-live="polite">
              {recentNotice}
            </p>
          )}
          {recentError && <p role="alert">{recentError}</p>}
          {recentLoading && <p aria-live="polite">Reading recent searches.</p>}
          {currentRecentLoad?.status === 'error' && !recentError && (
            <p role="alert">
              Recent searches could not be read from this browser.
            </p>
          )}
          {currentRecentLoad?.status === 'ready' &&
            recentSearches.length === 0 && <p>No recent searches yet.</p>}
          {currentRecentLoad?.status === 'ready' &&
            recentSearches.length > 0 && (
              <>
                <ul className="recent-search-list" aria-label="Recent searches">
                  {recentSearches.map((entry) => (
                    <li key={entry.id}>
                      <button
                        className="recent-search-item"
                        type="button"
                        aria-label={`Search again for ${entry.query}`}
                        onClick={() => {
                          setSearchState(null);
                          setRecentNotice('');
                          setRecentError('');
                          setQueryRevision((revision) => revision + 1);
                          setQuery(entry.query);
                        }}
                      >
                        {entry.query}
                      </button>
                      <time dateTime={entry.occurredAt}>
                        {entry.occurredAt}
                      </time>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setRecentNotice('');
                    setRecentError('');
                    setRecentDialogOpen(true);
                  }}
                >
                  Clear recent searches
                </button>
              </>
            )}
        </section>
      )}
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
              onActivate={() =>
                recordOpenedSearch(row.match.record.product.datasetVersionId)
              }
              onCancelPendingWrite={cancelQueryUrlSync}
            />
          ))}
        </ol>
      )}
      {recentDialogOpen && (
        <ConfirmationDialog
          title="Clear recent searches?"
          message="This removes recent searches from this browser."
          confirmLabel="Clear searches"
          fallbackFocusRef={headingRef}
          onCancel={() => setRecentDialogOpen(false)}
          onConfirm={clearRecentSearches}
        />
      )}
    </section>
  );
}
