// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  LocalDatasetGeneration,
} from '@intermed/domain';
import { DatasetStatus } from './DatasetStatus';

afterEach(cleanup);

const generation: LocalDatasetGeneration = {
  generationId: 'dv\u001fsource.synthetic\u001fsynthetic-beta',
  dataset: 'synthetic-medication-catalogue',
  version: 'synthetic-beta',
  schemaVersion: 'medication-catalogue-1',
  sourceIds: ['ds\u001fintermed\u001fsource.synthetic'],
  publishedAt: '2026-10-01T00:00:00.000Z',
  importedAt: '2026-10-01T00:00:00Z',
  downloadedAt: '2026-10-02T07:30:00.000Z',
  checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
  coverage: 'Synthetic development fixture. Not for clinical use.',
  recordCounts: { products: 2 },
  synthetic: true,
};

function source(state: DatasetUpdateState): DatasetStateSource {
  return { getState: () => state, subscribe: () => () => {} };
}

it('shows never-downloaded in default mode and offers no download action', () => {
  render(<DatasetStatus dataset={source({ status: 'never-downloaded' })} />);
  expect(
    screen.getByRole('heading', { name: 'Local medication dataset' }),
  ).toBeVisible();
  expect(screen.getByTestId('dataset-section')).toHaveAttribute(
    'data-dataset-state',
    'never-downloaded',
  );
  expect(
    screen.getByText(/No medication dataset has been downloaded/),
  ).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(/not for clinical use/i)).not.toBeInTheDocument();
});

it('labels a synthetic active generation as not for clinical use', () => {
  render(<DatasetStatus dataset={source({ status: 'ready', generation })} />);
  expect(screen.getByTestId('dataset-section')).toHaveAttribute(
    'data-dataset-state',
    'ready',
  );
  expect(screen.getByText('synthetic-beta')).toBeVisible();
  expect(
    screen.getByText('Synthetic development data — not for clinical use.'),
  ).toBeVisible();
  expect(screen.getByText('2026-10-02T07:30:00.000Z')).toBeVisible();
  expect(screen.getByText(/ago|today/)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('does not label a non-synthetic generation as synthetic', () => {
  render(
    <DatasetStatus
      dataset={source({
        status: 'ready',
        generation: { ...generation, synthetic: false },
      })}
    />,
  );
  expect(
    screen.queryByText('Synthetic development data — not for clinical use.'),
  ).not.toBeInTheDocument();
  expect(screen.getByText('synthetic-beta')).toBeVisible();
});

it.each([
  [
    'checking',
    {
      status: 'checking',
      generation: null,
    } as DatasetUpdateState,
    /Checking for a published dataset update/,
  ],
  [
    'update-available',
    {
      status: 'update-available',
      generation: null,
      candidate: {
        generationId: 'dv\u001fsource.synthetic\u001fsynthetic-gamma',
        version: 'synthetic-gamma',
        publishedAt: null,
      },
    } as DatasetUpdateState,
    /newer dataset \(synthetic-gamma\) is published/,
  ],
  [
    'downloading',
    {
      status: 'downloading',
      generation: null,
      candidate: {
        generationId: 'dv\u001fsource.synthetic\u001fsynthetic-gamma',
        version: 'synthetic-gamma',
        publishedAt: null,
      },
    } as DatasetUpdateState,
    /Downloading dataset synthetic-gamma/,
  ],
  [
    'staging',
    {
      status: 'staging',
      generation: null,
      candidate: {
        generationId: 'dv\u001fsource.synthetic\u001fsynthetic-gamma',
        version: 'synthetic-gamma',
        publishedAt: null,
      },
    } as DatasetUpdateState,
    /Preparing dataset synthetic-gamma/,
  ],
  [
    'update-failed',
    {
      status: 'update-failed',
      reason: 'checksum-mismatch',
      generation: null,
    } as DatasetUpdateState,
    /download was corrupted/,
  ],
  [
    'storage-quota',
    { status: 'storage-quota', generation: null } as DatasetUpdateState,
    /storage is full/,
  ],
  [
    'evicted',
    {
      status: 'evicted',
      generationId: 'dv\u001fsource.synthetic\u001fsynthetic-beta',
    } as DatasetUpdateState,
    /missing from this browser/,
  ],
  [
    'unsupported-schema',
    { status: 'unsupported-schema' } as DatasetUpdateState,
    /written by a newer version of this app/,
  ],
  [
    'reload-required',
    { status: 'reload-required' } as DatasetUpdateState,
    /changed by another tab or a newer app version/,
  ],
  [
    'storage-unavailable',
    { status: 'storage-unavailable' } as DatasetUpdateState,
    /does not expose a local database/,
  ],
  [
    'storage-restricted',
    { status: 'storage-restricted' } as DatasetUpdateState,
    /restricts local storage/,
  ],
  [
    'opening',
    { status: 'opening' } as DatasetUpdateState,
    /Opening the local dataset/,
  ],
] as const)('explains the %s state in plain wording', (status, state, text) => {
  render(<DatasetStatus dataset={source(state)} />);
  expect(screen.getByTestId('dataset-section')).toHaveAttribute(
    'data-dataset-state',
    status,
  );
  expect(screen.getByText(text)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('keeps the previously downloaded dataset visible and explains failures', () => {
  render(
    <DatasetStatus
      dataset={source({
        status: 'update-failed',
        reason: 'integrity-failed',
        generation,
      })}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    /failed its integrity checks/,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    /previously downloaded dataset is kept/,
  );
  expect(screen.getByText('synthetic-beta')).toBeVisible();
});

it('never claims that local storage is permanent', () => {
  render(<DatasetStatus dataset={source({ status: 'never-downloaded' })} />);
  expect(
    screen.getByText(/Persistent storage is requested as best effort only/),
  ).toBeVisible();
  expect(screen.getByText(/can still be evicted or restricted/)).toBeVisible();
});

it('reacts to store changes and unsubscribes on unmount', () => {
  let state: DatasetUpdateState = { status: 'never-downloaded' };
  const listeners = new Set<() => void>();
  const dataset: DatasetStateSource = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const view = render(<DatasetStatus dataset={dataset} />);
  expect(screen.getByTestId('dataset-section')).toHaveAttribute(
    'data-dataset-state',
    'never-downloaded',
  );
  act(() => {
    state = { status: 'ready', generation };
    for (const listener of listeners) listener();
  });
  expect(screen.getByTestId('dataset-section')).toHaveAttribute(
    'data-dataset-state',
    'ready',
  );
  view.unmount();
  expect(listeners.size).toBe(0);
});
