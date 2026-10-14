// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { DatasetStateSource, DatasetUpdateState } from '@intermed/domain';
import { developmentShell } from '../application/shell';
import { DiagnosticsSection } from './DiagnosticsSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderDiagnostics() {
  const state: DatasetUpdateState = { status: 'never-downloaded' };
  return render(
    <DiagnosticsSection
      dataset={{
        getState: () => state,
        subscribe: () => () => {},
      }}
      shell={developmentShell}
      schemaVersion={1}
      runtimeMode="mock"
      shellRevision="synthetic-ui-revision"
      generatedAt={() => '2026-10-14T00:00:00.000Z'}
    />,
  );
}

it('shows versions and review status while treating unavailable storage capabilities honestly', async () => {
  renderDiagnostics();
  const report = await screen.findByLabelText('Diagnostics report');
  expect(report).toHaveTextContent('synthetic-ui-revision');
  expect(report).toHaveTextContent('Runtime mode: mock');
  expect(report).toHaveTextContent('Local-store supported schema version: 1');
  expect(report).toHaveTextContent('Dataset update state: never-downloaded');
  expect(report).toHaveTextContent('unreviewed');
  expect(report).toHaveTextContent('no approved provider');
  expect(report).toHaveTextContent('Storage persisted: unavailable');
});

it('copies the displayed plain text by keyboard and announces a polite confirmation', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  renderDiagnostics();
  const copy = await screen.findByRole('button', { name: 'Copy diagnostics' });
  copy.focus();
  await user.keyboard('{Enter}');
  expect(writeText).toHaveBeenCalledWith(
    screen.getByLabelText('Diagnostics report').textContent,
  );
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('status')).toHaveTextContent('Diagnostics copied.');
});

it.each(['missing', 'rejected'] as const)(
  'offers manual copy or JSON download when clipboard is %s',
  async (failure) => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value:
        failure === 'missing'
          ? undefined
          : {
              writeText: async () => {
                throw new Error('PRIVATE_CLIPBOARD_ERROR');
              },
            },
      configurable: true,
    });
    renderDiagnostics();
    await user.click(
      await screen.findByRole('button', { name: 'Copy diagnostics' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /select and copy.*download the JSON/i,
    );
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'PRIVATE_CLIPBOARD_ERROR',
    );
    expect(screen.getByLabelText('Diagnostics report')).toBeVisible();
  },
);

it('downloads the displayed snapshot as JSON and releases the object URL', async () => {
  const user = userEvent.setup();
  let blob: Blob | undefined;
  let name = '';
  const createObjectURL = vi.fn((value: Blob) => {
    blob = value;
    return 'blob:synthetic-diagnostics';
  });
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    name = this.download;
    expect(this.href).toBe('blob:synthetic-diagnostics');
    expect(this.isConnected).toBe(true);
  });
  renderDiagnostics();
  const download = await screen.findByRole('button', {
    name: 'Download diagnostics JSON',
  });
  download.focus();
  await user.keyboard(' ');
  expect(name).toBe('intermed-diagnostics-2026-10-14.json');
  expect(blob?.type).toBe('application/json');
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob!);
  });
  expect(JSON.parse(text)).toMatchObject({
    app: { shellRevision: 'synthetic-ui-revision' },
    localStore: { updateState: 'never-downloaded' },
    interactionProvider: 'no approved provider',
  });
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-diagnostics');
  expect(document.querySelector('a[download]')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Diagnostics downloaded.',
  );
});

it('retains the visible snapshot and reports download failures without error details', async () => {
  const user = userEvent.setup();
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => {
      throw new Error('PRIVATE_DOWNLOAD_ERROR');
    },
    configurable: true,
  });
  renderDiagnostics();
  await user.click(
    await screen.findByRole('button', { name: 'Download diagnostics JSON' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    /could not be downloaded.*select and copy/i,
  );
  expect(screen.getByRole('status')).not.toHaveTextContent(
    'PRIVATE_DOWNLOAD_ERROR',
  );
});

it('updates the report when the existing dataset and shell subscriptions change', async () => {
  let state: DatasetUpdateState = { status: 'never-downloaded' };
  let shellState = developmentShell.getSnapshot();
  let datasetListener = () => {};
  let shellListener = () => {};
  const dataset: DatasetStateSource = {
    getState: () => state,
    subscribe: (listener) => {
      datasetListener = listener;
      return () => {};
    },
  };
  render(
    <DiagnosticsSection
      dataset={dataset}
      shell={{
        ...developmentShell,
        getSnapshot: () => shellState,
        subscribe: (listener) => {
          shellListener = listener;
          return () => {};
        },
      }}
      schemaVersion={1}
      runtimeMode="mock"
    />,
  );
  await screen.findByLabelText('Diagnostics report');
  act(() => {
    state = { status: 'storage-restricted' };
    shellState = {
      ...shellState,
      availability: 'ready',
      version: 'new-shell',
      usingPrior: true,
      update: 'failed',
    };
    datasetListener();
    shellListener();
  });
  expect(screen.getByLabelText('Diagnostics report')).toHaveTextContent(
    'Dataset update state: storage-restricted',
  );
  expect(screen.getByLabelText('Diagnostics report')).toHaveTextContent(
    'Shell version: new-shell',
  );
  expect(screen.getByLabelText('Diagnostics report')).toHaveTextContent(
    'Shell using prior: true',
  );
});

it('shows storage estimate and persisted status from browser APIs', async () => {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: async () => ({ usage: 2048, quota: 8192 }),
      persisted: async () => true,
    },
  });
  renderDiagnostics();
  expect(
    await screen.findByText(/Storage usage \(bytes, origin estimate\): 2048/),
  ).toHaveTextContent('Storage persisted: true');
});
