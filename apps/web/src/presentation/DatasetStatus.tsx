import { useSyncExternalStore } from 'react';
import type {
  DatasetStateSource,
  DatasetUpdateFailureReason,
  DatasetUpdateState,
  LocalDatasetGeneration,
} from '@intermed/domain';

/**
 * Present the local dataset state on the status page in plain, nonclinical
 * wording. This milestone stores and shows state only: it offers no download,
 * search or favorites action. A synthetic active generation is always labelled
 * "not for clinical use", and storage is described as best-effort because
 * browsers can evict or restrict it.
 */

const FAILURE_TEXT: Record<DatasetUpdateFailureReason, string> = {
  'manifest-unavailable': 'the published version information could not be read',
  'invalid-manifest': 'the published version information was not valid',
  'incompatible-schema': 'this app version cannot use the published dataset',
  'bundle-unavailable': 'the dataset download failed',
  'invalid-bundle': 'the downloaded dataset was not in the expected shape',
  'checksum-mismatch': 'the download was corrupted',
  'integrity-failed': 'the downloaded dataset failed its integrity checks',
  'count-mismatch': 'the downloaded dataset did not match the published counts',
  interrupted: 'the update was interrupted',
  'writer-busy': 'another tab was updating the dataset at the same time',
};

function ageText(downloadedAt: string): string {
  const days = Math.floor(
    (Date.now() - Date.parse(downloadedAt)) / (24 * 60 * 60 * 1000),
  );
  if (!Number.isFinite(days) || days < 0) return 'age unknown';
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function keptText(generation: LocalDatasetGeneration | null): string {
  return generation
    ? 'The previously downloaded dataset is kept.'
    : 'No medication dataset is downloaded yet.';
}

function candidateVersion(state: DatasetUpdateState): string {
  return 'candidate' in state ? state.candidate.version : '';
}

function summary(state: DatasetUpdateState): string | null {
  switch (state.status) {
    case 'opening':
      return 'Opening the local dataset in this browser.';
    case 'never-downloaded':
      return 'No medication dataset has been downloaded into this browser. Medication lookup stays unavailable until one is downloaded.';
    case 'ready':
      return 'A downloaded medication dataset is active.';
    case 'checking':
      return `Checking for a published dataset update. ${
        state.generation
          ? 'The downloaded dataset stays usable.'
          : 'No medication dataset is downloaded yet.'
      }`;
    case 'update-available':
      return `A newer dataset (${candidateVersion(
        state,
      )}) is published and not downloaded yet.`;
    case 'downloading':
      return `Downloading dataset ${candidateVersion(state)}. ${
        state.generation
          ? 'The active dataset stays usable.'
          : 'No medication dataset is downloaded yet.'
      }`;
    case 'staging':
      return `Preparing dataset ${candidateVersion(
        state,
      )}. It becomes active only after validation.`;
    case 'evicted':
      return 'The downloaded dataset is missing from this browser. It may have been evicted or deleted. Download it again to use medication lookup.';
    case 'unsupported-schema':
      return 'The stored data was written by a newer version of this app. Nothing was deleted. Update or reload the app to use it.';
    case 'reload-required':
      return 'The local database was changed by another tab or a newer app version. Reload this tab to continue.';
    case 'storage-unavailable':
      return 'This browser does not expose a local database. Nothing can be stored in this browser.';
    case 'storage-restricted':
      return 'This browser or profile restricts local storage, for example in private mode. Nothing was stored.';
    case 'update-failed':
    case 'storage-quota':
      return null;
  }
}

function alertText(state: DatasetUpdateState): string | null {
  if (state.status === 'update-failed')
    return `The dataset update was not applied: ${
      FAILURE_TEXT[state.reason]
    }. ${keptText(state.generation)}`;
  if (state.status === 'storage-quota')
    return `Browser storage is full. The update was stopped. ${keptText(
      state.generation,
    )}`;
  return null;
}

function generationOf(
  state: DatasetUpdateState,
): LocalDatasetGeneration | null {
  return 'generation' in state ? state.generation : null;
}

/** Present the local dataset state and its honest limitations. */
export function DatasetStatus({ dataset }: { dataset: DatasetStateSource }) {
  const state = useSyncExternalStore(dataset.subscribe, dataset.getState);
  const generation = generationOf(state);
  const summaryText = summary(state);
  const failure = alertText(state);
  return (
    <section
      className="dataset-status"
      aria-labelledby="dataset-status-title"
      data-testid="dataset-section"
      data-dataset-state={state.status}
    >
      <h2 id="dataset-status-title">Local medication dataset</h2>
      {summaryText && <p role="status">{summaryText}</p>}
      {failure && <p role="alert">{failure}</p>}
      {generation && (
        <dl className="status-list">
          <div>
            <dt>Dataset version</dt>
            <dd>{generation.version}</dd>
          </div>
          <div>
            <dt>Downloaded</dt>
            <dd>{generation.downloadedAt}</dd>
          </div>
          <div>
            <dt>Age</dt>
            <dd>{ageText(generation.downloadedAt)}</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{generation.coverage}</dd>
          </div>
        </dl>
      )}
      {generation?.synthetic && (
        <p className="synthetic-label">
          Synthetic development data — not for clinical use.
        </p>
      )}
      <p className="storage-note">
        Persistent storage is requested as best effort only. Browser storage can
        still be evicted or restricted at any time, for example in private mode
        or when space runs out.
      </p>
    </section>
  );
}
