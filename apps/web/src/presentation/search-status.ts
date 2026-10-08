import type {
  DatasetUpdateState,
  LocalDatasetGeneration,
} from '@intermed/domain';
import type { MedicationSearchResponse } from '../application/medication-search';

export type SearchStatus =
  | { readonly status: 'pending' }
  | { readonly status: 'error' }
  | {
      readonly status: 'success';
      readonly response: MedicationSearchResponse;
    }
  | null;

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

function countMessage(response: MedicationSearchResponse): string {
  if (response.truncated)
    return `Showing ${response.results.length} of ${response.total} — refine your search.`;
  if (response.total === 0) return 'No medication products match this search.';
  return `${response.total} medication candidate${
    response.total === 1 ? '' : 's'
  } found.`;
}

/** Return the accessible status copy for the current dataset and search state. */
export function getSearchStatusMessage({
  datasetState,
  query,
  search,
}: {
  readonly datasetState: DatasetUpdateState;
  readonly query: string;
  readonly search: SearchStatus;
}): string {
  const generation = generationOf(datasetState);
  const notice = activeUpdateNotice(datasetState);
  const withNotice = (message: string) =>
    notice ? `${message} ${notice}` : message;

  if (!generation) return notice ?? 'No active local dataset is available.';
  if (search?.status === 'error')
    return 'Search is temporarily unavailable. Try again or check dataset status.';
  if (search?.status === 'pending' || (query.trim() !== '' && !search))
    return withNotice('Searching the active local medication dataset.');
  if (search?.status === 'success')
    return withNotice(countMessage(search.response));
  return (
    notice ??
    'Enter a name, active ingredient, ATC code, or manufacturer to search.'
  );
}
