import { describe, expect, it } from 'vitest';
import {
  catalogueFingerprint,
  deserializeCatalogue,
  deriveStableId,
  type MedicationCatalogueSnapshot,
} from '@intermed/domain';
import { stage } from '../../packages/importer/src/stage';
import type { StageRequest } from '../../packages/importer/src/core';
import { FakeStore, transportFault } from './support/fake-ports';
import {
  buildRawDocument,
  fictivolProduct,
  placebexProduct,
  present,
  rawBytes,
  rawBytesPretty,
  testConfig,
  vacantolProduct,
} from './support/synthetic-raws';

const EMPTY = new Uint8Array();

function deserialized(
  bytes: Uint8Array | undefined,
): MedicationCatalogueSnapshot {
  if (!bytes) throw new Error('candidate bytes are missing');
  const result = deserializeCatalogue(new TextDecoder().decode(bytes));
  if (!result.ok) throw new Error('candidate does not deserialize');
  return result.snapshot;
}

function runStage(
  store: FakeStore,
  bytes: Uint8Array,
  config = testConfig(),
  encoding = 'utf-8',
) {
  const request: StageRequest = {
    config,
    snapshotBytes: bytes,
    encoding,
    ports: store.stagePorts(),
  };
  return stage(request);
}

function baselineOf(
  snapshot: MedicationCatalogueSnapshot,
  id: string,
): {
  baselineVersionId: string;
  baselineFingerprint: string;
  catalogue: MedicationCatalogueSnapshot;
} {
  return {
    baselineVersionId: id,
    baselineFingerprint: catalogueFingerprint(snapshot),
    catalogue: snapshot,
  };
}

describe('stage quarantine guards', () => {
  it('quarantines invalid JSON and records a bounded run summary', async () => {
    const store = new FakeStore();
    const result = await runStage(store, new TextEncoder().encode('{ invalid'));
    expect(result.status).toBe('quarantined');
    expect(store.quarantines).toHaveLength(1);
    expect(store.runSummaries.size).toBe(1);
    expect(store.candidates.size).toBe(0);
  });

  it('quarantines a snapshot that is not marked synthetic', async () => {
    const store = new FakeStore();
    const document = {
      ...buildRawDocument({ products: [fictivolProduct()] }),
      synthetic: false,
    };
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('rejected');
    expect(store.candidates.size).toBe(0);
  });

  it('quarantines a source key outside the synthetic allowlist', async () => {
    const store = new FakeStore();
    const bytes = rawBytes(buildRawDocument({ products: [fictivolProduct()] }));
    const result = await runStage(
      store,
      bytes,
      testConfig({ syntheticAllowlist: ['source.other'] }),
    );
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('rejected');
    expect(store.candidates.size).toBe(0);
  });

  it('always quarantines partial and incomplete snapshots with no candidate', async () => {
    for (const completeness of ['partial', 'missing'] as const) {
      const store = new FakeStore();
      const document: Record<string, unknown> = {
        ...buildRawDocument({ products: [fictivolProduct()] }),
      };
      if (completeness === 'missing') delete document.completeness;
      else document.completeness = completeness;
      const result = await runStage(store, rawBytes(document));
      expect(result.status).toBe('quarantined');
      expect(store.candidates.size).toBe(0);
    }
  });

  it('always quarantines empty snapshots and never writes a candidate', async () => {
    const store = new FakeStore();
    const bytes = rawBytes(buildRawDocument({ products: [] }));
    const result = await runStage(store, bytes);
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('empty-snapshot');
    expect(store.candidates.size).toBe(0);
    expect(store.reviews.size).toBe(0);
  });

  it('quarantines forged declared counts against the actual rows', async () => {
    const store = new FakeStore();
    const document = buildRawDocument({ products: [fictivolProduct()] });
    document.recordCounts.products = 5;
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('count-mismatch');
  });

  it('enforces config row bounds during staging', async () => {
    const store = new FakeStore();
    const bytes = rawBytes(
      buildRawDocument({ products: [fictivolProduct(), placebexProduct()] }),
    );
    const result = await runStage(store, bytes, testConfig({ maxRows: 1 }));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('row-bound-exceeded');
  });

  it('quarantines conflicting duplicate rows', async () => {
    const store = new FakeStore();
    const document = buildRawDocument({ products: [fictivolProduct()] });
    document.products.push({ ...document.products[0]!, commercialName: 'X' });
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('conflicting-duplicate');
  });

  it('quarantines rows with foreign provenance', async () => {
    const store = new FakeStore();
    const document = buildRawDocument({ products: [fictivolProduct()] });
    document.products[0]!.sourceKey = 'source.missing';
    document.products[0]!.datasetVersionKey = 'missing-version';
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('provenance-mismatch');
    expect(store.candidates.size).toBe(0);
  });

  it('quarantines domain-invalid rows', async () => {
    const store = new FakeStore();
    const document = buildRawDocument({ products: [fictivolProduct()] });
    document.products[0]!.commercialName = '';
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('invalid');
  });

  it('quarantines dangling entity references', async () => {
    const store = new FakeStore();
    const document = buildRawDocument({ products: [fictivolProduct()] });
    document.products[0]!.dosageFormKey = {
      status: 'present',
      value: 'DF-GONE',
    };
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('referential-integrity');
  });

  it('quarantines when a non-empty baseline has no catalogue', async () => {
    const store = new FakeStore();
    store.baseline = {
      baselineVersionId: 'dv-base-1',
      baselineFingerprint: 'fingerprint-base-1',
    };
    const bytes = rawBytes(buildRawDocument({ products: [fictivolProduct()] }));
    const result = await runStage(store, bytes);
    expect(result.status).toBe('quarantined');
    expect(result.completenessStatus).toBe('baseline-unavailable');
    expect(store.candidates.size).toBe(0);
  });

  it('quarantines conflicting and unsupported encoding requests', async () => {
    const bytes = rawBytes(buildRawDocument({ products: [fictivolProduct()] }));
    const conflicting = new FakeStore();
    const first = await runStage(
      conflicting,
      bytes,
      testConfig({ parserEncoding: 'utf-8' }),
      'windows-1250',
    );
    expect(first.status).toBe('quarantined');
    expect(first.completenessStatus).toBe('encoding-mismatch');

    const unsupported = new FakeStore();
    const second = await runStage(unsupported, bytes, testConfig(), 'latin-1');
    expect(second.status).toBe('quarantined');
    expect(second.completenessStatus).toBe('unsupported-encoding');
    expect(unsupported.candidates.size).toBe(0);
  });
});

describe('stage generation identity', () => {
  it('stages a candidate whose generation identity equals the real dataset version id', async () => {
    const store = new FakeStore();
    const bytes = rawBytes(buildRawDocument({ products: [fictivolProduct()] }));
    const result = await runStage(store, bytes);
    expect(result.status).toBe('staged');
    const candidate = store.candidates.get(result.identity.datasetVersionId);
    const snapshot = deserialized(candidate);
    expect(snapshot.datasetVersions[0]!.id).toBe(
      result.identity.datasetVersionId,
    );
    const generationIds = [
      ...snapshot.products.map((item) => item.datasetVersionId),
      ...snapshot.activeIngredients.map((item) => item.datasetVersionId),
      ...snapshot.medicationIngredients.map((item) => item.datasetVersionId),
      ...snapshot.dosageForms.map((item) => item.datasetVersionId),
    ];
    expect(new Set(generationIds)).toEqual(
      new Set([result.identity.datasetVersionId]),
    );
  });

  it('derives the generation only from raw SHA and canonical config before sealing', async () => {
    const store = new FakeStore();
    const document = buildRawDocument({ products: [fictivolProduct()] });
    expect(document.datasetVersion.version).toBe('synthetic-fictivol-v1');
    const result = await runStage(store, rawBytes(document));
    expect(result.status).toBe('staged');
    const expectedId = deriveStableId(
      'DatasetVersion',
      'source.fictivol',
      result.identity.generationVersionKey,
    );
    expect(expectedId.ok).toBe(true);
    if (!expectedId.ok) return;
    expect(result.identity.datasetVersionId).toBe(expectedId.id);
    expect(result.identity.generationVersionKey).not.toBe(
      'synthetic-fictivol-v1',
    );
    const snapshot = deserialized(
      store.candidates.get(result.identity.datasetVersionId),
    );
    expect(snapshot.datasetVersions[0]!.version).toBe(
      result.identity.generationVersionKey,
    );
  });

  it('produces baseline-independent deterministic bytes', async () => {
    const document = buildRawDocument({ products: [fictivolProduct()] });
    const bytes = rawBytes(document);

    const firstStore = new FakeStore();
    const first = await runStage(firstStore, bytes);
    const secondStore = new FakeStore();
    const firstSnapshot = deserialized(
      firstStore.candidates.get(first.identity.datasetVersionId),
    );
    secondStore.baseline = baselineOf(
      firstSnapshot,
      first.identity.datasetVersionId,
    );
    const second = await runStage(secondStore, bytes);

    expect(second.identity.datasetVersionId).toBe(
      first.identity.datasetVersionId,
    );
    expect(
      secondStore.candidates.get(second.identity.datasetVersionId),
    ).toEqual(firstStore.candidates.get(first.identity.datasetVersionId));
  });

  it('does not report an unchanged next generation as all changed', async () => {
    const document = buildRawDocument({
      products: [fictivolProduct(), placebexProduct()],
    });
    const firstStore = new FakeStore();
    const first = await runStage(firstStore, rawBytes(document));
    expect(first.status).toBe('staged');
    const firstSnapshot = deserialized(
      firstStore.candidates.get(first.identity.datasetVersionId),
    );

    const nextStore = new FakeStore();
    nextStore.baseline = baselineOf(
      firstSnapshot,
      first.identity.datasetVersionId,
    );
    const second = await runStage(
      nextStore,
      rawBytesPretty({
        ...document,
        datasetVersion: {
          ...document.datasetVersion,
          version: 'synthetic-fictivol-v2',
          previousVersionKey: present(
            firstSnapshot.datasetVersions[0]!.version,
          ),
        },
      }),
    );
    expect(second.status).toBe('staged');
    expect(second.identity.datasetVersionId).not.toBe(
      first.identity.datasetVersionId,
    );
    const review = nextStore.reviews.get(second.identity.datasetVersionId);
    expect(review?.diffSummary).toEqual({
      added: 0,
      changed: 0,
      renamed: 0,
      removed: 0,
      netProducts: 2,
    });
  });
});

describe('stage product diff against real baselines', () => {
  async function stageBaseline(
    products: ReturnType<typeof fictivolProduct>[],
  ): Promise<{
    snapshot: MedicationCatalogueSnapshot;
    id: string;
  }> {
    const store = new FakeStore();
    const result = await runStage(
      store,
      rawBytes(buildRawDocument({ products })),
    );
    expect(result.status).toBe('staged');
    return {
      snapshot: deserialized(
        store.candidates.get(result.identity.datasetVersionId),
      ),
      id: result.identity.datasetVersionId,
    };
  }

  async function diffAgainst(
    baseline: { snapshot: MedicationCatalogueSnapshot; id: string },
    products: ReturnType<typeof fictivolProduct>[],
    config = testConfig(),
  ) {
    const store = new FakeStore();
    store.baseline = baselineOf(baseline.snapshot, baseline.id);
    const result = await runStage(
      store,
      rawBytes(
        buildRawDocument({
          products,
          ...(baseline.snapshot.datasetVersions[0]?.version
            ? {
                previousVersionKey:
                  baseline.snapshot.datasetVersions[0].version,
              }
            : {}),
        }),
      ),
      config,
    );
    const review = [...store.reviews.values()][0];
    return { result, review, store };
  }

  it('counts added, changed, renamed and removed products', async () => {
    const baseline = await stageBaseline([
      fictivolProduct(),
      placebexProduct(),
      vacantolProduct(),
    ]);
    const renamedPlacebex = {
      ...placebexProduct(),
      commercialName: 'Placebex Renamed',
    };
    const changedFictivol = {
      ...fictivolProduct(),
      dosageFormKey: 'DF-CAPSULE',
    };
    const { review } = await diffAgainst(baseline, [
      changedFictivol,
      renamedPlacebex,
      {
        sourceProductId: 'SP-NEWBEX',
        commercialName: 'Newbex',
      },
    ]);
    expect(review?.diffSummary).toEqual({
      added: 1,
      changed: 1,
      renamed: 1,
      removed: 1,
      netProducts: 3,
    });
  });

  it('treats an equal count replacement as one addition and one removal', async () => {
    const baseline = await stageBaseline([
      fictivolProduct(),
      placebexProduct(),
    ]);
    const { review } = await diffAgainst(baseline, [
      fictivolProduct(),
      {
        sourceProductId: 'SP-REPLACEMENT',
        commercialName: 'Replacement',
      },
    ]);
    expect(review?.diffSummary).toEqual({
      added: 1,
      changed: 0,
      renamed: 0,
      removed: 1,
      netProducts: 2,
    });
  });

  it.each([false, true])(
    'detects related ingredient link changes as product changes (renamed: %s)',
    async (renamed) => {
      const baseline = await stageBaseline([fictivolProduct()]);
      const changed = fictivolProduct();
      if (renamed) changed.commercialName = 'Fictivol Renamed';
      changed.ingredients = [
        {
          key: 'AI-FICTIVOLINUM',
          text: 'Fictivolinum',
          joinKey: 'MI-FICTIVOL',
          value: '600',
          unit: 'mg',
        },
      ];
      const { review } = await diffAgainst(baseline, [changed]);
      expect(review?.diffSummary).toEqual({
        added: 0,
        changed: 1,
        renamed: 0,
        removed: 0,
        netProducts: 1,
      });
    },
  );

  it.each([false, true])(
    'detects form changes as product changes (renamed: %s)',
    async (renamed) => {
      const baseline = await stageBaseline([fictivolProduct()]);
      const changed = { ...fictivolProduct(), dosageFormKey: 'DF-CAPSULE' };
      if (renamed) changed.commercialName = 'Fictivol Renamed';
      const { review } = await diffAgainst(baseline, [changed]);
      expect(review?.diffSummary).toEqual({
        added: 0,
        changed: 1,
        renamed: 0,
        removed: 0,
        netProducts: 1,
      });
    },
  );

  it('writes a private large-drop quarantine and keeps the candidate reviewable', async () => {
    const products = [
      fictivolProduct(),
      placebexProduct(),
      vacantolProduct(),
      { sourceProductId: 'SP-NEWBEX', commercialName: 'Newbex' },
    ];
    const baseline = await stageBaseline(products);
    const { review, store } = await diffAgainst(
      baseline,
      [fictivolProduct()],
      testConfig({ largeRemovalCount: 2, largeRemovalPercent: 50 }),
    );
    expect(review?.largeRemovalRequired).toBe(true);
    expect(review?.quarantineReason).toBe('large-removal');
    expect(store.quarantines.map((entry) => entry.reason)).toContain(
      'large-removal',
    );
    expect(store.candidates.size).toBe(1);
    expect([...store.runSummaries.values()][0]?.largeRemovalRequired).toBe(
      true,
    );
  });

  it('does not flag a large drop when nothing is removed', async () => {
    const baseline = await stageBaseline([fictivolProduct()]);
    const { review, store } = await diffAgainst(
      baseline,
      [fictivolProduct()],
      testConfig({ largeRemovalCount: 1, largeRemovalPercent: 0 }),
    );
    expect(review?.largeRemovalRequired).toBe(false);
    expect(store.quarantines).toHaveLength(0);
  });
});

describe('stage bounded private records', () => {
  it('keeps run summaries and logs free of source text', async () => {
    const store = new FakeStore();
    const bytes = rawBytes(
      buildRawDocument({
        products: [
          {
            sourceProductId: 'SP-SENTINEL',
            commercialName: 'Fictivol-SENTINEL-9753',
          },
        ],
      }),
    );
    await runStage(store, bytes);
    const summaries = JSON.stringify([...store.runSummaries.values()]);
    const logs = JSON.stringify(store.logs);
    const quarantines = JSON.stringify(
      store.quarantines.map((entry) => entry.issues),
    );
    for (const record of [summaries, logs, quarantines]) {
      expect(record).not.toContain('SENTINEL');
    }
    for (const summary of store.runSummaries.values()) {
      expect(summary.issueCodes.length).toBeLessThanOrEqual(20);
    }
  });

  it('keeps quarantine issues bounded', async () => {
    const store = new FakeStore();
    await runStage(store, new TextEncoder().encode('{ invalid'));
    for (const entry of store.quarantines) {
      expect(entry.issues.length).toBeLessThanOrEqual(20);
      for (const issue of entry.issues) {
        expect(issue.length).toBeLessThanOrEqual(244);
      }
    }
  });

  it('continues staging when the log sink fails', async () => {
    const store = new FakeStore();
    store.setFault('log', transportFault('log sink down'));
    const bytes = rawBytes(buildRawDocument({ products: [fictivolProduct()] }));
    const result = await runStage(store, bytes);
    expect(result.status).toBe('staged');
    expect(store.runSummaries.size).toBe(1);
  });
});

describe('stage fault injection', () => {
  const invalidBytes = new TextEncoder().encode('{ invalid');
  it.each([
    ['readRawSnapshot', EMPTY, 0, 0],
    ['readBaseline', EMPTY, 0, 0],
    ['sha256', EMPTY, 0, 0],
    ['writeQuarantine', invalidBytes, 0, 0],
    ['writeCandidate', EMPTY, 0, 0],
    ['writeReview', EMPTY, 1, 0],
    ['writeRunSummary', EMPTY, 1, 1],
  ] as const)(
    'fails closed when %s fails',
    async (name, bytes, candidatesAfter, reviewsAfter) => {
      const store = new FakeStore();
      store.raw = rawBytes(buildRawDocument({ products: [fictivolProduct()] }));
      store.setFault(name, transportFault(`injected ${name} failure`));
      await expect(runStage(store, bytes)).rejects.toThrow(
        `injected ${name} failure`,
      );
      expect(store.candidates.size).toBe(candidatesAfter);
      expect(store.reviews.size).toBe(reviewsAfter);
    },
  );
});
