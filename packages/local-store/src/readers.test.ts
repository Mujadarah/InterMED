import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import {
  deriveStableId,
  deserializeCatalogue,
  MedicationDetailIntegrityError,
  MISSING,
  presentField,
  sealCatalogue,
  serializeCatalogue,
  unknownField,
  type FieldState,
  type MedicationIngredient,
  type MedicationProduct,
  type MedicationCatalogueSnapshot,
  type MedicationDetailEntityKind,
} from '@intermed/domain';
import { RETAIN_READY_FOR_MS, STALE_STAGING_MS } from './store';
import { catalogueTable, type CatalogueStoreName } from './schema';
import {
  bundle,
  testClock,
  testDatabase,
  testMarkerLock,
  testStore,
  uniqueName,
} from './test-support';
import { SYNTHETIC_SOURCE_KEY } from './synthetic-bundle';
import { sha256TransportChecksum } from './validate';

function presentValue(field: FieldState<string>): string {
  if (field.status !== 'present')
    throw new Error('The synthetic fixture does not provide the value');
  return field.value;
}

/**
 * References a pinned, published generation guarantees at import time. Each case
 * deletes one referenced row from the store, which is local data damage and can
 * never be a source gap.
 */
const referenceCases: ReadonlyArray<
  readonly [
    MedicationDetailEntityKind,
    CatalogueStoreName,
    (
      product: MedicationProduct,
      joins: readonly MedicationIngredient[],
    ) => string,
  ]
> = [
  ['ATCCode', 'atcCodes', (product) => product.atcCodeIds[0] ?? ''],
  [
    'Manufacturer',
    'manufacturers',
    (product) => product.manufacturerIds[0] ?? '',
  ],
  [
    'RegulatoryDocument',
    'documents',
    (product) => product.regulatoryDocumentIds[0] ?? '',
  ],
  [
    'DosageForm',
    'dosageForms',
    (product) => presentValue(product.dosageFormId),
  ],
  [
    'MarketingAuthorizationHolder',
    'holders',
    (product) => presentValue(product.marketingAuthorizationHolderId),
  ],
  ['DataSource', 'sources', (product) => product.sourceId],
  ['DatasetVersion', 'datasetVersions', (product) => product.datasetVersionId],
  [
    'ActiveIngredient',
    'ingredients',
    (_product, joins) => presentValue(joins[0]?.ingredientId ?? MISSING),
  ],
];

it.each(referenceCases)(
  'rejects a detail read whose %s reference no longer resolves',
  async (kind, table, reference) => {
    const name = uniqueName();
    const store = testStore({ name });
    const source = await bundle('damage');
    await store.updates.stageAndActivate(source.manifest, source.text);
    const reader = (await store.openReader())!;
    const productId = source.productIds['SP-FICTIVOL']!;
    const rows = await testDatabase(name);
    const productRow = await rows.products.get([
      source.generationId,
      productId,
    ]);
    const joinRows = await rows.productIngredients
      .where('[generationId+productId]')
      .equals([source.generationId, productId])
      .toArray();
    if (!productRow) throw new Error('The synthetic product row is missing');
    const referencedId = reference(
      productRow.entity,
      joinRows.map((row) => row.entity),
    );

    // Damage one pinned, published generation: a row that its references point
    // at is gone. That is local storage damage, not a source gap.
    await catalogueTable(rows, table).delete([
      source.generationId,
      referencedId,
    ]);
    rows.close();

    const error = await reader
      .productDetail(productId)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(MedicationDetailIntegrityError);
    expect((error as Error).name).toBe('MedicationDetailIntegrityError');
    expect((error as Error).message).toContain(kind);
    reader.release();
  },
);

async function repackage(
  source: Awaited<ReturnType<typeof bundle>>,
  change: (
    snapshot: MedicationCatalogueSnapshot,
  ) => MedicationCatalogueSnapshot,
): Promise<Awaited<ReturnType<typeof bundle>>> {
  const decoded = deserializeCatalogue(source.text);
  if (!decoded.ok) throw new Error('The source fixture is invalid');
  const sealed = sealCatalogue(change(decoded.snapshot));
  const text = serializeCatalogue(sealed);
  const version = sealed.datasetVersions[0];
  if (!version) throw new Error('The fixture has no dataset version');
  return {
    ...source,
    text,
    manifest: {
      ...source.manifest,
      checksum: await sha256TransportChecksum(new TextEncoder().encode(text)),
      recordCounts: Object.fromEntries(Object.entries(version.recordCounts)),
    },
  };
}

it('pins one generation per reader and switches only at the next reader', async () => {
  const store = testStore();
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const pinned = (await store.openReader())!;
  expect(pinned.generationId).toBe(alpha.generationId);

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(
    (await pinned.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol alpha');
  expect(pinned.generationId).toBe(alpha.generationId);

  const next = (await store.openReader())!;
  expect(next.generationId).toBe(beta.generationId);
  expect(
    (await next.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol beta');
  pinned.release();
  next.release();
});

it('rolls back to the retained previous generation', async () => {
  const store = testStore();
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(store.getState()).toMatchObject({
    generation: { generationId: beta.generationId },
  });

  await expect(store.rollback()).resolves.toEqual({ ok: true });
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  const reader = (await store.openReader())!;
  expect(
    (await reader.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol alpha');

  await expect(store.rollback()).resolves.toEqual({ ok: true });
  expect(store.getState()).toMatchObject({
    generation: { generationId: beta.generationId },
  });
});

it('collects expired generations but never active, previous or pinned ones', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now, retainReadyForMs: 0 });
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  const gamma = await bundle('gamma');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const pinned = (await store.openReader())!;

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);
  expect(await store.collect()).not.toContain(alpha.generationId);
  const alsoPinned = await store.openPinnedReader(alpha.generationId);
  expect(alsoPinned).not.toBeNull();

  alsoPinned!.release();
  pinned.release();
  expect(await store.collect()).toEqual([alpha.generationId]);
  expect(await store.openPinnedReader(alpha.generationId)).toBeNull();
  expect(await store.openPinnedReader(beta.generationId)).not.toBeNull();
  expect(store.getState()).toMatchObject({
    generation: { generationId: gamma.generationId },
  });
});

it('retains ready generations inside the conservative cross-tab window', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now });
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  const gamma = await bundle('gamma');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);

  expect(await store.collect()).toEqual([]);
  clock.tick(RETAIN_READY_FOR_MS);
  expect(await store.collect()).toEqual([alpha.generationId]);
  expect(await store.openPinnedReader(beta.generationId)).not.toBeNull();
});

it('restarts the retention window when a rollback reactivates a generation', async () => {
  const clock = testClock();
  const name = uniqueName();
  const tabA = testStore({ name, now: clock.now });
  const tabB = testStore({ name, now: clock.now });
  const rows = await testDatabase(name);
  const alpha = await bundle('alpha');
  await tabA.updates.stageAndActivate(alpha.manifest, alpha.text);
  const firstReadyAt = (await rows.generations.get(alpha.generationId))
    ?.readyAt;

  // Alpha is a full day old when the rollback makes it active again.
  clock.tick(RETAIN_READY_FOR_MS + 60 * 60 * 1000);
  const beta = await bundle('beta');
  await tabA.updates.stageAndActivate(beta.manifest, beta.text);
  await expect(tabA.rollback()).resolves.toEqual({ ok: true });
  // `readyAt` keeps the original staging-to-ready time; the retention window
  // is anchored on the new activation instead.
  expect((await rows.generations.get(alpha.generationId))?.readyAt).toBe(
    firstReadyAt,
  );

  // Another tab pins alpha right after the rollback; its pin is invisible to
  // this tab's collection, so the retention window is what protects alpha.
  expect(await tabB.openPinnedReader(alpha.generationId)).not.toBeNull();
  const gamma = await bundle('gamma');
  const delta = await bundle('delta');
  await tabA.updates.stageAndActivate(gamma.manifest, gamma.text);
  await tabA.updates.stageAndActivate(delta.manifest, delta.text);

  clock.tick(60 * 60 * 1000);
  expect(await tabA.collect()).not.toContain(alpha.generationId);
  expect(await tabB.openPinnedReader(alpha.generationId)).not.toBeNull();

  // The window is not endless: one window after the rollback it expires.
  clock.tick(RETAIN_READY_FOR_MS);
  expect(await tabA.collect()).toContain(alpha.generationId);
});

it('refuses collection while another tab is staging instead of deleting under it', async () => {
  const clock = testClock();
  const name = uniqueName();
  let reached: () => void = () => {};
  let release: () => void = () => {};
  const reachedStaging = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = testStore({
    name,
    now: clock.now,
    // The simulated clock runs past the staging grace period inside one tick,
    // so the writer keeps a lease that outlives it.
    lock: (await testMarkerLock(name, clock.now, { ttlMs: 4 * 60 * 60 * 1000 }))
      .lock,
    onStaged: async ({ store }) => {
      if (store === 'ingredients') {
        reached();
        await blocked;
      }
    },
  });
  const other = testStore({ name, now: clock.now });
  const alpha = await bundle('alpha');

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  // The staging run is long enough to look abandoned to a stale snapshot.
  clock.tick(STALE_STAGING_MS + 1_000);
  expect(await other.collect()).toEqual([]);

  release();
  await running;
  expect(writer.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  expect(await other.openPinnedReader(alpha.generationId)).not.toBeNull();
});

it('honours a pin taken while collection is running', async () => {
  const clock = testClock();
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  let armed = false;
  let pinning: Promise<unknown> | null = null;
  const store = testStore({
    retainReadyForMs: 0,
    now: () => {
      // The first clock read inside collection happens after its snapshot of
      // generations: that is when another reader pins the second candidate.
      if (armed) {
        armed = false;
        pinning = store.openPinnedReader(beta.generationId);
      }
      return clock.now();
    },
  });
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const heldAlpha = (await store.openPinnedReader(alpha.generationId))!;
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  const heldBeta = (await store.openPinnedReader(beta.generationId))!;
  const gamma = await bundle('gamma');
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);
  const delta = await bundle('delta');
  await store.updates.stageAndActivate(delta.manifest, delta.text);
  // Both generations are expired and unkept now; their pins kept them alive.
  heldAlpha.release();
  heldBeta.release();

  armed = true;
  const collecting = store.collect();
  await vi.waitFor(() => expect(pinning).not.toBeNull());
  const pinned = (await pinning) as { release(): void } | null;
  expect(pinned).not.toBeNull();

  // Alpha is collected; beta was pinned after the snapshot and must survive.
  expect(await collecting).toEqual([alpha.generationId]);
  expect((await store.openPinnedReader(beta.generationId))!).not.toBeNull();
  pinned!.release();
});

it('restarts a generation retention window when a reader pins it', async () => {
  const clock = testClock();
  const name = uniqueName();
  const tabA = testStore({ name, now: clock.now });
  const tabB = testStore({ name, now: clock.now });
  const alpha = await bundle('alpha');
  await tabA.updates.stageAndActivate(alpha.manifest, alpha.text);
  const beta = await bundle('beta');
  await tabA.updates.stageAndActivate(beta.manifest, beta.text);
  const gamma = await bundle('gamma');
  await tabA.updates.stageAndActivate(gamma.manifest, gamma.text);
  expect(await tabA.collect()).toEqual([]);

  // A day later another tab reads alpha: that pin restarts the retention
  // window of the generation for this tab as well.
  clock.tick(RETAIN_READY_FOR_MS + 60 * 60 * 1000);
  const pinned = (await tabB.openPinnedReader(alpha.generationId))!;
  expect(pinned).not.toBeNull();
  pinned.release();

  clock.tick(60 * 60 * 1000);
  expect(await tabA.collect()).not.toContain(alpha.generationId);
  clock.tick(RETAIN_READY_FOR_MS);
  expect(await tabA.collect()).toContain(alpha.generationId);
});

it('collects abandoned staged generations only after the grace period', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now, retainReadyForMs: 0 });
  const alpha = await bundle('alpha');
  const abandoned = await bundle('abandoned');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageBundle(abandoned.manifest, abandoned.text);

  expect(await store.collect()).toEqual([]);
  clock.tick(STALE_STAGING_MS);
  expect(await store.collect()).toEqual([abandoned.generationId]);
  expect(await store.openPinnedReader(alpha.generationId)).not.toBeNull();
  expect(store.getState()).toMatchObject({
    generation: { generationId: alpha.generationId },
  });
});

it('refuses to roll back to an incomplete previous generation', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  // Eviction: parts of the previous generation's rows are gone.
  const rows = await testDatabase(name);
  await rows.products.where('generationId').equals(alpha.generationId).delete();

  await expect(store.rollback()).resolves.toEqual({
    ok: false,
    reason: 'previous-incomplete',
  });
  // The pointer did not move: the active generation is still the good one.
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });
});

it('looks up names, DCI, links and ATC codes inside the pinned generation only', async () => {
  const store = testStore();
  const diacritics = await bundle('beta', {
    products: [
      {
        key: 'SP-COMMA',
        name: 'Fictășî',
        ingredientKeys: ['AI-FICTIVOLINUM'],
      },
      {
        key: 'SP-CEDILLA',
        name: 'Fictăşî',
        ingredientKeys: ['AI-FICTIVOLINUM'],
      },
    ],
  });
  await store.updates.stageAndActivate(diacritics.manifest, diacritics.text);
  const reader = (await store.openReader())!;

  const folded = await reader.productsByNamePrefix('fictasi');
  expect(folded.map((product) => product.commercialName).sort()).toEqual([
    'Fictăşî beta',
    'Fictășî beta',
  ]);
  expect(await reader.productsByNamePrefix('fictăşî')).toHaveLength(2);
  expect(await reader.productsByNamePrefix('placebex')).toHaveLength(0);

  const alpha = await bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  // The pinned reader keeps its own generation: the new one is invisible to it.
  expect(await reader.productsByNamePrefix('fictivol')).toHaveLength(0);

  const current = (await store.openReader())!;
  expect(
    (await current.productsByNamePrefix('fictivol')).map(
      (product) => product.commercialName,
    ),
  ).toEqual(['Fictivol alpha']);
  expect(
    (await current.ingredientsByDciPrefix('fictivolinum')).map(
      (ingredient) => ingredient.preferredName,
    ),
  ).toEqual(['Fictivolinum alpha']);
  expect(await current.ingredientsByDciPrefix('placebexium')).toHaveLength(1);
  expect(
    (await current.productsByAtcCode('SYN-SP-FICTIVOL')).map(
      (product) => product.commercialName,
    ),
  ).toEqual(['Fictivol alpha']);
  expect(await current.productsByAtcCode('SYN-SP-NOTHING')).toHaveLength(0);
  expect(
    await current.productIngredients(alpha.productIds['SP-PLACEBEX']!),
  ).toHaveLength(3);
  expect(await current.productIds()).toHaveLength(2);
  reader.release();
  current.release();
});

it('builds search records only from the reader’s pinned generation', async () => {
  const store = testStore();
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const pinned = (await store.openReader())!;

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  const documents = await pinned.searchRecords();

  expect(documents).toHaveLength(2);
  const fictivol = documents.find(
    (document) => document.product.commercialName === 'Fictivol alpha',
  );
  expect(fictivol).toMatchObject({
    ingredientNames: ['Fictivolinum alpha'],
    atcCodes: ['SYN-SP-FICTIVOL'],
    dosageFormName: 'fictional tablet alpha',
    manufacturerNames: ['Synthetica Laboratories'],
  });
  expect(
    documents.some((document) =>
      document.product.commercialName.endsWith(' beta'),
    ),
  ).toBe(false);

  const current = (await store.openReader())!;
  expect(
    (await current.searchRecords()).map(
      (document) => document.product.commercialName,
    ),
  ).toEqual(['Fictivol beta', 'Placebex beta']);
  pinned.release();
  current.release();
});

it('assembles a product detail from its pinned generation', async () => {
  const store = testStore();
  const alpha = await bundle('alpha');
  const beta = await bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const pinned = (await store.openReader())!;

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  const detail = await pinned.productDetail(alpha.productIds['SP-PLACEBEX']!);

  expect(detail).not.toBeNull();
  if (!detail) throw new Error('The pinned product was not found');
  expect(detail).toMatchObject({
    generation: {
      generationId: alpha.generationId,
      version: 'synthetic-alpha',
    },
    product: {
      commercialName: 'Placebex alpha',
      status: 'active',
    },
    dosageForm: {
      displayName: 'fictional tablet alpha',
    },
    atcCodes: [
      {
        code: 'SYN-SP-PLACEBEX',
        illustrative: true,
        displayName: {
          status: 'present',
          value: 'Synthetic illustrative class alpha',
        },
      },
    ],
    manufacturers: [{ name: 'Synthetica Laboratories' }],
    marketingAuthorizationHolder: { name: 'Placebo Holding' },
    regulatoryDocuments: [
      {
        title: { status: 'present', value: 'Fictional Placebex note' },
        url: 'https://example.invalid/intermed/synthetic-document',
      },
    ],
    dataSource: {
      name: 'Synthetic development catalogue',
      authority: 'Fictional Test Authority',
      rightsStatus: 'unresolved',
    },
    datasetVersion: { version: 'synthetic-alpha' },
  });
  expect(
    detail.ingredients.map(({ medicationIngredient, activeIngredient }) => ({
      sourceText: medicationIngredient.sourceIngredientText,
      preferredName: activeIngredient?.preferredName ?? null,
      strength: medicationIngredient.strengthOriginalText,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        sourceText: 'Placebexium alpha',
        preferredName: 'Placebexium alpha',
        strength: presentField('500 mg'),
      },
      {
        sourceText: 'Synthetinum alpha',
        preferredName: 'Synthetinum alpha',
        strength: presentField('500 mg'),
      },
      {
        sourceText: 'Fictovolol alpha',
        preferredName: 'Fictovolol alpha',
        strength: presentField('500 mg'),
      },
    ]),
  );
  expect(JSON.stringify(detail)).not.toContain(' beta');
  pinned.release();
});

it('keeps missing source fields and absent relationships explicit in the projection', async () => {
  const store = testStore();
  const source = await bundle('missing');
  const fixture = await repackage(source, (snapshot) => ({
    ...snapshot,
    products: snapshot.products.map((product) =>
      product.id === source.productIds['SP-FICTIVOL']
        ? {
            ...product,
            cim: MISSING,
            originalDciText: MISSING,
            strengthText: MISSING,
            dosageFormId: MISSING,
            route: MISSING,
            atcCodeIds: [],
            manufacturerIds: [],
            marketingAuthorizationHolderId: MISSING,
            authorizationNumber: MISSING,
            authorizationDate: MISSING,
            authorizationStatus: MISSING,
            presentationOrPackDescription: MISSING,
            regulatoryDocumentIds: [],
          }
        : product,
    ),
  }));
  await store.updates.stageAndActivate(fixture.manifest, fixture.text);
  const reader = (await store.openReader())!;

  const detail = await reader.productDetail(fixture.productIds['SP-FICTIVOL']!);

  expect(detail).not.toBeNull();
  expect(detail?.product).toMatchObject({
    cim: MISSING,
    originalDciText: MISSING,
    strengthText: MISSING,
    dosageFormId: MISSING,
    route: MISSING,
    authorizationNumber: MISSING,
    authorizationDate: MISSING,
    authorizationStatus: MISSING,
    presentationOrPackDescription: MISSING,
  });
  expect(detail).toMatchObject({
    dosageForm: null,
    atcCodes: [],
    manufacturers: [],
    marketingAuthorizationHolder: null,
    regulatoryDocuments: [],
  });
  reader.release();
});

it('returns removed and unresolved products with multiple documents and a missing URL', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const source = await bundle('states');
  let secondDocumentId: string | null = null;
  const fixture = await repackage(source, (snapshot) => {
    const fictivolId = source.productIds['SP-FICTIVOL'];
    const placebexId = source.productIds['SP-PLACEBEX'];
    const fictivol = snapshot.products.find(
      (product) => product.id === fictivolId,
    );
    const firstDocument = snapshot.regulatoryDocuments.find(
      (document) => document.productId === fictivolId,
    );
    if (!fictivol || !firstDocument)
      throw new Error('The synthetic product or document is missing');
    const sourceRecordKey = 'RD-SP-FICTIVOL-PIL';
    const derived = deriveStableId(
      'RegulatoryDocument',
      SYNTHETIC_SOURCE_KEY,
      sourceRecordKey,
    );
    if (!derived.ok) throw new Error('The synthetic document id was rejected');
    secondDocumentId = derived.id;
    const secondDocument = {
      ...firstDocument,
      id: derived.id,
      type: 'PIL' as const,
      title: presentField('Fictional Fictivol leaflet'),
      url: 'https://example.invalid/intermed/synthetic-leaflet',
      documentVersion: presentField('fictional-edition'),
      sourceRecordKey,
    };
    return {
      ...snapshot,
      products: snapshot.products.map((product) =>
        product.id === fictivolId
          ? {
              ...product,
              status: 'removed' as const,
              regulatoryDocumentIds: [
                ...product.regulatoryDocumentIds,
                derived.id,
              ],
            }
          : product.id === placebexId
            ? { ...product, status: 'unresolved' as const }
            : product,
      ),
      regulatoryDocuments: [...snapshot.regulatoryDocuments, secondDocument],
    };
  });
  await store.updates.stageAndActivate(fixture.manifest, fixture.text);
  const reader = (await store.openReader())!;
  if (!secondDocumentId) throw new Error('The second document id was not made');
  const database = await testDatabase(name);
  const documentRow = await database.documents.get([
    fixture.generationId,
    secondDocumentId,
  ]);
  if (!documentRow) throw new Error('The second document row is missing');
  await database.documents.put({
    ...documentRow,
    entity: { ...documentRow.entity, url: '' },
  });
  database.close();

  const removed = await reader.productDetail(
    fixture.productIds['SP-FICTIVOL']!,
  );
  const unresolved = await reader.productDetail(
    fixture.productIds['SP-PLACEBEX']!,
  );

  expect(removed?.product.status).toBe('removed');
  expect(removed?.regulatoryDocuments).toHaveLength(2);
  expect(removed?.regulatoryDocuments.map((document) => document.type)).toEqual(
    ['other', 'PIL'],
  );
  expect(removed?.regulatoryDocuments[1]?.url).toBe('');
  expect(unresolved?.product.status).toBe('unresolved');
  reader.release();
});

it('preserves unmapped composition and the nonfatal quality tokens', async () => {
  const store = testStore();
  const source = await bundle('quality');
  const fixture = await repackage(source, (snapshot) => ({
    ...snapshot,
    medicationIngredients: snapshot.medicationIngredients.map((join) =>
      join.productId === source.productIds['SP-FICTIVOL']
        ? {
            ...join,
            ingredientId: MISSING,
            sourceIngredientText: 'Fictional source ingredient quality',
            strengthValue: presentField('500,125'),
            strengthValueNormalized: unknownField('ambiguous-decimal'),
            strengthUnit: {
              status: 'invalid' as const,
              sourceText: 'mg?',
              reason: 'unrecognized-unit' as const,
            },
            strengthOriginalText: presentField('500,125 mg?'),
            mappingStatus: 'unresolved' as const,
          }
        : join,
    ),
  }));
  await store.updates.stageAndActivate(fixture.manifest, fixture.text);
  const reader = (await store.openReader())!;

  const detail = await reader.productDetail(fixture.productIds['SP-FICTIVOL']!);

  expect(detail?.ingredients).toEqual([
    expect.objectContaining({
      medicationIngredient: expect.objectContaining({
        sourceIngredientText: 'Fictional source ingredient quality',
        strengthOriginalText: presentField('500,125 mg?'),
        strengthUnit: {
          status: 'invalid',
          sourceText: 'mg?',
          reason: 'unrecognized-unit',
        },
        strengthValueNormalized: unknownField('ambiguous-decimal'),
        mappingStatus: 'unresolved',
      }),
      activeIngredient: null,
    }),
  ]);
  reader.release();
});

it('returns null for a product id absent from the pinned generation', async () => {
  const store = testStore();
  const source = await bundle('alpha');
  await store.updates.stageAndActivate(source.manifest, source.text);
  const reader = (await store.openReader())!;
  const presentProduct = await reader.product(
    source.productIds['SP-FICTIVOL']!,
  );
  if (!presentProduct) throw new Error('The fixture product is missing');
  const absentId = deriveStableId(
    'MedicationProduct',
    SYNTHETIC_SOURCE_KEY,
    'SP-MISSING',
  );
  if (!absentId.ok) throw new Error('The synthetic product id was rejected');

  await expect(reader.productDetail(absentId.id)).resolves.toBeNull();
  reader.release();
});
