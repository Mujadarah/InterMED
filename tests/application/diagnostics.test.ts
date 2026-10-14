import { mustId } from '../domain/builders';
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import {
  BMI_FORMULA,
  MOSTELLER_BSA_FORMULA,
  FormulaRegistry,
  pendingApprovals,
  type DatasetUpdateState,
  type LocalDatasetGeneration,
} from '@intermed/domain';
import {
  createLocalDatasetStore,
  createMemoryEventBus,
} from '@intermed/local-store';
import {
  buildDiagnosticsReport,
  diagnosticsText,
  type DiagnosticsSources,
} from '../../apps/web/src/application/diagnostics';

const generation: LocalDatasetGeneration = {
  generationId: 'dv\u001fsource.synthetic\u001fsynthetic-alpha',
  dataset: 'synthetic-catalogue',
  version: 'synthetic-alpha',
  schemaVersion: 'medication-catalogue-1',
  sourceIds: ['source.synthetic'],
  publishedAt: '2026-10-01T00:00:00.000Z',
  importedAt: '2026-10-01T00:00:00.000Z',
  downloadedAt: '2026-10-12T00:00:00.000Z',
  checksum: 'synthetic-digest',
  coverage: 'FREE_TEXT_MUST_NOT_LEAK',
  recordCounts: { products: 2 },
  synthetic: true,
};

function sources(
  datasetState: DatasetUpdateState = { status: 'ready', generation },
): DiagnosticsSources {
  const registry = new FormulaRegistry();
  registry.register(BMI_FORMULA);
  registry.register(MOSTELLER_BSA_FORMULA);
  return {
    shellRevision: 'synthetic-revision',
    runtimeMode: 'mock',
    schemaVersion: 1,
    shellState: {
      availability: 'ready',
      version: 'synthetic-shell',
      update: 'failed',
      usingPrior: true,
      canInstall: false,
    },
    datasetState,
    formulas: [BMI_FORMULA, MOSTELLER_BSA_FORMULA],
    pendingApprovals: pendingApprovals(registry),
    storage: { usageBytes: 1024, quotaBytes: 4096, persisted: false },
    userAgent: 'SyntheticBrowser/1.0',
    generatedAt: '2026-10-14T00:00:00.000Z',
  };
}

it('builds version, age, update, formula review and storage diagnostics from injected snapshots', () => {
  const input = sources();
  const report = buildDiagnosticsReport(input);
  expect(report).toMatchObject({
    format: 'intermed-diagnostics',
    version: 1,
    generatedAt: '2026-10-14T00:00:00.000Z',
    userAgent: 'SyntheticBrowser/1.0',
    app: { shellRevision: 'synthetic-revision', runtimeMode: 'mock' },
    shell: {
      availability: 'ready',
      version: 'synthetic-shell',
      update: 'failed',
      usingPrior: true,
    },
    localStore: {
      schemaVersion: 1,
      updateState: 'ready',
      activeDataset: {
        versionId: generation.generationId,
        version: 'synthetic-alpha',
        ageDays: 2,
        sourceIds: ['source.synthetic'],
        synthetic: true,
      },
    },
    calculators: {
      // Owner approvals (PR #28) leave only the wording-bump components
      // presentation@2.0.1 and confirmation@1.0.1 pending for each formula.
      pendingApprovalCount: 4,
      formulas: [
        {
          formulaId: 'bmi',
          formulaVersion:
            'formula=1.0.0|population=2.1.0|classification=2.0.0|presentation=2.0.1|confirmation=1.0.1',
          reviewStatus: 'unreviewed',
          pendingApprovalCount: 2,
        },
        {
          formulaId: 'bsa-mosteller',
          reviewStatus: 'unreviewed',
          pendingApprovalCount: 2,
        },
      ],
    },
    interactionProvider: 'no approved provider',
    storage: { usageBytes: 1024, quotaBytes: 4096, persisted: false },
  });
  expect(diagnosticsText(report)).toContain(
    'Dataset age (days since download): 2',
  );
  expect(diagnosticsText(report)).toContain('no approved provider');
  expect(JSON.stringify(report)).not.toContain('FREE_TEXT_MUST_NOT_LEAK');
  expect(buildDiagnosticsReport(input)).toEqual(report);
});

it.each([
  'never-downloaded',
  'storage-restricted',
  'unsupported-schema',
  'evicted',
] as const)('reports missing data honestly for %s', (status) => {
  const state: DatasetUpdateState =
    status === 'evicted' ? { status, generationId: 'missing-id' } : { status };
  const report = buildDiagnosticsReport({
    ...sources(state),
    schemaVersion: null,
    storage: { usageBytes: null, quotaBytes: null, persisted: null },
    shellState: {
      availability: 'unsupported',
      update: 'none',
      canInstall: false,
    },
  });
  expect(report.localStore.activeDataset).toBeNull();
  expect(report.localStore.updateState).toBe(status);
  expect(report.localStore.schemaVersion).toBeNull();
  expect(report.shell.version).toBeNull();
  expect(report.shell.usingPrior).toBeNull();
  expect(diagnosticsText(report)).toContain('unavailable');
});

it.each(['invalid', '2026-10-15T00:00:00.000Z'])(
  'does not invent age for %s download time',
  (downloadedAt) => {
    expect(
      buildDiagnosticsReport(
        sources({
          status: 'ready',
          generation: { ...generation, downloadedAt },
        }),
      ).localStore.activeDataset?.ageDays,
    ).toBeNull();
  },
);

it('retains the active dataset when an update fails and includes only the failure code', () => {
  const report = buildDiagnosticsReport(
    sources({
      status: 'update-failed',
      generation,
      reason: 'checksum-mismatch',
    }),
  );
  expect(report.localStore).toMatchObject({
    updateState: 'update-failed',
    failureReason: 'checksum-mismatch',
    activeDataset: { version: 'synthetic-alpha' },
  });
});

it('excludes seeded favorites, recent searches, viewed medication names and extra free text from both exports', async () => {
  const store = createLocalDatasetStore({
    name: 'diagnostics-exclusion-' + crypto.randomUUID(),
    events: createMemoryEventBus(),
    lockStrategy: 'marker',
  });
  try {
    await store.open();
    await store.preferences.addFavorite({
      productId: mustId('MedicationProduct', 'test', 'PRIVATE_PRODUCT'),
      lastKnownDisplayName: 'PRIVATE_MEDICATION_NAME',
      lastKnownDatasetVersionId: mustId(
        'DatasetVersion',
        'test',
        'PRIVATE_PREFERENCE_VERSION',
      ),
    });
    await store.preferences.addRecentSearch({
      query: 'PRIVATE_SEARCH_QUERY',
      lastKnownDatasetVersionId: mustId(
        'DatasetVersion',
        'test',
        'PRIVATE_HISTORY_VERSION',
      ),
    });
    const favorites = await store.preferences.listFavorites();
    const recentSearches = await store.preferences.listRecentSearches();
    expect(favorites).toHaveLength(1);
    expect(recentSearches).toHaveLength(1);
    // Extra properties simulate accidental caller over-supply. The builder must allowlist.
    const injected = {
      ...sources(store.getState()),
      favorites,
      recentSearches,
      freeText: 'PRIVATE_FREE_TEXT',
      medicationName: 'PRIVATE_VIEWED_MEDICATION',
    };
    const report = buildDiagnosticsReport(injected);
    const exported = JSON.stringify(report) + diagnosticsText(report);
    for (const secret of [
      'PRIVATE_PRODUCT',
      'PRIVATE_MEDICATION_NAME',
      'PRIVATE_PREFERENCE_VERSION',
      'PRIVATE_SEARCH_QUERY',
      'PRIVATE_HISTORY_VERSION',
      'PRIVATE_FREE_TEXT',
      'PRIVATE_VIEWED_MEDICATION',
    ]) {
      expect(exported).not.toContain(secret);
    }
    expect(exported).not.toMatch(
      /favorites|recentSearches|medicationName|freeText/,
    );
  } finally {
    await store.preferences.clearAllLocalData();
    store.close();
  }
});
