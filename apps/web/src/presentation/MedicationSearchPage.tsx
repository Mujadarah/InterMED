import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  FieldState,
  LocalDatasetGeneration,
  MedicationProduct,
  MedicationSearchMatch,
} from '@intermed/domain';
import type {
  MedicationSearchResponse,
  MedicationSearchService,
} from '../application/medication-search';
import { datasetAgeText } from './dataset-age';

const SEARCH_DEBOUNCE_MS = 200;
const NOT_PROVIDED = 'Not provided by source';

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

function activeUpdateNotice(state: DatasetUpdateState): string | null {
  const hasGeneration = generationOf(state) !== null;
  switch (state.status) {
    case 'opening':
      return 'Opening local medication data in this browser.';
    case 'never-downloaded':
      return 'No medication dataset has been downloaded into this browser. Search is unavailable. This build has no dataset download control.';
    case 'ready':
      return null;
    case 'checking':
      return hasGeneration
        ? 'Checking for a dataset update. The active local dataset remains available.'
        : 'Checking for a dataset update. No medication dataset is available yet.';
    case 'update-available':
      return hasGeneration
        ? `A newer dataset ${state.candidate.version} is available but is not downloaded. Search uses the currently active dataset.`
        : `A newer dataset is available but is not downloaded (${state.candidate.version}). Search is unavailable.`;
    case 'downloading':
      return hasGeneration
        ? 'A dataset update is downloading. Search uses the currently active dataset.'
        : 'A medication dataset is downloading. Search becomes available after it is activated.';
    case 'staging':
      return hasGeneration
        ? 'A dataset update is being prepared. Search uses the currently active dataset.'
        : 'A dataset is being prepared and is not active yet.';
    case 'evicted':
      return 'The downloaded dataset is missing from this browser. It may have been evicted or deleted. Search is unavailable until data is restored.';
    case 'unsupported-schema':
      return 'The stored data was written by a newer version of this app. Nothing was deleted. Update or reload the app to use it.';
    case 'reload-required':
      return 'The local database changed in another tab or app version. Reload this tab to continue.';
    case 'storage-unavailable':
      return 'This browser does not expose a local database. Nothing can be stored or searched here.';
    case 'storage-restricted':
      return 'This browser or profile restricts local storage. No medication dataset is available for search.';
    case 'update-failed':
      return hasGeneration
        ? 'The dataset update failed. The previously active dataset remains available.'
        : 'The dataset update failed and no active copy is available.';
    case 'storage-quota':
      return hasGeneration
        ? 'Browser storage is full. The previously active dataset remains available.'
        : 'Browser storage is full and no active copy is available.';
  }
}

function availableField(field: FieldState<string>): string {
  return field.status === 'present' && field.value.trim()
    ? field.value
    : NOT_PROVIDED;
}

function dosageForm(record: MedicationSearchMatch['record']): string {
  return record.dosageFormName?.trim() || NOT_PROVIDED;
}

function manufacturers(record: MedicationSearchMatch['record']): string {
  const names = record.manufacturerNames.filter((name) => name.trim());
  return names.length > 0 ? names.join(', ') : NOT_PROVIDED;
}

function catalogueStatus(product: MedicationProduct): string {
  switch (product.status) {
    case 'active':
      return 'Present in local dataset';
    case 'removed':
      return 'Removed from dataset';
    case 'unresolved':
      return 'Unresolved product record';
  }
}

function countMessage(response: MedicationSearchResponse): string {
  if (response.truncated)
    return `Showing ${response.results.length} of ${response.total} — refine your search.`;
  if (response.total === 0) return 'No medication products match this search.';
  return `${response.total} medication candidate${
    response.total === 1 ? '' : 's'
  } found.`;
}

function SearchResult({ match }: { match: MedicationSearchMatch }) {
  const product = match.record.product;
  const values = {
    strength: availableField(product.strengthText),
    dosageForm: dosageForm(match.record),
    route: availableField(product.route),
    authorization: availableField(product.authorizationStatus),
    manufacturer: manufacturers(match.record),
  };
  const href = `/medication/${encodeURIComponent(product.id)}`;

  return (
    <li className="search-result">
      <Link
        to={href}
        tabIndex={0}
        aria-label={`Open ${product.commercialName}. Strength: ${values.strength}. Dosage form: ${values.dosageForm}. Route: ${values.route}. Authorization status: ${values.authorization}. Manufacturer: ${values.manufacturer}. Catalogue record status: ${catalogueStatus(product)}.`}
      >
        <span className="search-result-name">{product.commercialName}</span>
        <dl className="search-result-details">
          <div>
            <dt>Strength</dt>
            <dd>{values.strength}</dd>
          </div>
          <div>
            <dt>Dosage form</dt>
            <dd>{values.dosageForm}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{values.route}</dd>
          </div>
          <div>
            <dt>Authorization status</dt>
            <dd>{values.authorization}</dd>
          </div>
          <div>
            <dt>Manufacturer</dt>
            <dd>{values.manufacturer}</dd>
          </div>
          <div>
            <dt>Catalogue record status</dt>
            <dd>{catalogueStatus(product)}</dd>
          </div>
        </dl>
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
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestRevision = useRef(0);

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
  const searching = Boolean(generation && query.trim() && !currentSearchState);

  const notice = activeUpdateNotice(state);
  const withNotice = (message: string) =>
    notice ? `${message} ${notice}` : message;
  let statusMessage: string;
  if (!generation)
    statusMessage = notice ?? 'No active local dataset is available.';
  else if (searchError)
    statusMessage =
      'Search is temporarily unavailable. Try again or check dataset status.';
  else if (query.trim() && searching)
    statusMessage = withNotice(
      'Searching the active local medication dataset.',
    );
  else if (result) statusMessage = withNotice(countMessage(result));
  else if (query.trim())
    statusMessage = withNotice(
      'Searching the active local medication dataset.',
    );
  else
    statusMessage =
      notice ??
      'Enter a name, active ingredient, ATC code, or manufacturer to search.';

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
          {result.results.map((match) => (
            <SearchResult key={match.record.product.id} match={match} />
          ))}
        </ol>
      )}
    </section>
  );
}
