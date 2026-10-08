// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import {
  MedicationDetailIntegrityError,
  MISSING,
  presentField,
  unknownField,
  type DatasetStateSource,
  type DatasetUpdateState,
  type FieldState,
  type LocalDatasetGeneration,
  type MedicationProductDetail,
} from '@intermed/domain';
import {
  atc,
  document,
  dosageForm,
  emptyCatalogue,
  ingredient,
  join,
  manufacturer,
  holder,
  product as makeProduct,
} from '../../../../tests/domain/builders';
import type { MedicationDetailService } from '../application/medication-detail';
import { MedicationDetailPage } from './MedicationDetailPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixtureProduct(
  status: 'active' | 'removed' | 'unresolved' = 'active',
) {
  const form = dosageForm('DF-DETAIL', 'fictional capsule form');
  const atcCode = atc('ATC-DETAIL', 'SYN-DETAIL');
  const maker = manufacturer('MF-DETAIL', 'Fictional Works');
  const secondMaker = manufacturer('MF-DETAIL-SECOND', 'Imaginary Labs');
  const authorizationHolder = holder('MAH-DETAIL', 'Fictional Holder');
  const product = makeProduct('SP-DETAIL', 'Fictivol detail', {
    cim: presentField('CIM-FICTIONAL-17'),
    originalDciText: presentField('Original source DCI'),
    strengthText: presentField('500,125 mg?'),
    dosageFormId: presentField(form.id),
    route: presentField('fictional-route-text'),
    atcCodeIds: [atcCode.id],
    manufacturerIds: [maker.id, secondMaker.id],
    marketingAuthorizationHolderId: presentField(authorizationHolder.id),
    authorizationNumber: presentField('AUTH-SYNTHETIC-17'),
    authorizationDate: presentField('2026-09-17'),
    authorizationStatus: presentField('synthetic status text'),
    presentationOrPackDescription: presentField('10 fictional units'),
    regulatoryDocumentIds: [],
    sourceVersion: 'source-version-verbatim',
    firstSeenAt: '2026-09-01T00:00:00Z',
    lastSeenAt: '2026-10-01T00:00:00Z',
    status,
  });
  return {
    product,
    dosageForm: form,
    atcCode,
    manufacturers: [maker, secondMaker],
    authorizationHolder,
  };
}

function fixtureIngredients(
  product: MedicationProductDetail['product'],
): MedicationProductDetail['ingredients'] {
  const mappedIngredient = ingredient(
    'AI-DETAIL',
    'Preferred fictitious name',
    {
      dci: presentField('Source DCI text'),
    },
  );
  const mappedJoin = join(
    'MI-DETAIL-MAPPED',
    product.id,
    'Fictional ingredient text from source',
    {
      ingredientId: presentField(mappedIngredient.id),
      strengthValue: presentField('500,125'),
      strengthValueNormalized: unknownField('ambiguous-decimal'),
      strengthUnit: {
        status: 'invalid',
        sourceText: 'mg?',
        reason: 'unrecognized-unit',
      },
      strengthOriginalText: presentField('500,125 mg?'),
      mappingStatus: 'confirmed',
    },
  );
  const unresolvedJoin = join(
    'MI-DETAIL-UNRESOLVED',
    product.id,
    'Fictional unresolved ingredient text',
    {
      ingredientId: MISSING,
      strengthOriginalText: MISSING,
      mappingStatus: 'unresolved',
    },
  );
  return [
    { medicationIngredient: mappedJoin, activeIngredient: mappedIngredient },
    { medicationIngredient: unresolvedJoin, activeIngredient: null },
  ];
}

function fixtureDocuments(
  product: MedicationProductDetail['product'],
): MedicationProductDetail['regulatoryDocuments'] {
  const rcp = {
    ...document('RD-DETAIL-RCP', product.id),
    type: 'RCP' as const,
    title: presentField('Fictional RCP reference'),
    url: 'https://example.invalid/fictional/rcp',
    language: presentField('ro-fictional'),
    documentVersion: presentField('edition-fictional-1'),
    publishedAt: presentField('2026-08-01T00:00:00Z'),
    retrievedAt: presentField('2026-08-02T00:00:00Z'),
  };
  const pil = {
    ...document('RD-DETAIL-PIL', product.id),
    type: 'PIL' as const,
    title: presentField('Fictional PIL reference'),
    url: '',
    language: MISSING,
    documentVersion: MISSING,
    publishedAt: MISSING,
    retrievedAt: MISSING,
    cachedContentReference: presentField('synthetic-cached-content-reference'),
    cacheRightsStatus: 'prohibited' as const,
  };
  return [rcp, pil];
}

function fixtureProvenance(): Pick<
  MedicationProductDetail,
  'generation' | 'dataSource' | 'datasetVersion'
> {
  const catalogue = emptyCatalogue();
  const source = catalogue.dataSources[0];
  const version = catalogue.datasetVersions[0];
  if (!source || !version)
    throw new Error('The synthetic provenance is missing');
  const datasetVersion = {
    ...version,
    version: 'synthetic-detail-v1',
    publishedAt: presentField('2026-10-02T00:00:00Z'),
    upstreamPublishedAt: presentField('2026-10-05T00:00:00Z'),
    importedAt: '2026-10-03T00:00:00Z',
  };
  const generation: LocalDatasetGeneration = {
    generationId: 'generation-synthetic-detail',
    dataset: 'synthetic-medication-catalogue',
    version: datasetVersion.version,
    schemaVersion: 'medication-catalogue-1',
    sourceIds: [source.id],
    publishedAt: '2026-10-02T00:00:00Z',
    importedAt: datasetVersion.importedAt,
    downloadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    checksum: 'synthetic-detail-checksum',
    coverage: 'Fictional fixture only.',
    recordCounts: { products: 1 },
    synthetic: true,
  };
  return { generation, dataSource: source, datasetVersion };
}

function detail(
  status: 'active' | 'removed' | 'unresolved' = 'active',
  composition: {
    readonly originalDciText?: FieldState<string>;
    readonly ingredients?: MedicationProductDetail['ingredients'];
  } = {},
) {
  const { product, dosageForm, atcCode, manufacturers, authorizationHolder } =
    fixtureProduct(status);
  const documents = fixtureDocuments(product);
  const { generation, dataSource, datasetVersion } = fixtureProvenance();
  const composedProduct = composition.originalDciText
    ? { ...product, originalDciText: composition.originalDciText }
    : product;
  return {
    generation,
    product: {
      ...composedProduct,
      regulatoryDocumentIds: documents.map((document) => document.id),
    },
    ingredients: composition.ingredients ?? fixtureIngredients(composedProduct),
    dosageForm,
    atcCodes: [atcCode],
    manufacturers,
    marketingAuthorizationHolder: authorizationHolder,
    regulatoryDocuments: documents,
    dataSource,
    datasetVersion,
  } satisfies MedicationProductDetail;
}

function dataset(state: DatasetUpdateState): DatasetStateSource {
  return { getState: () => state, subscribe: () => () => {} };
}

function renderPage(
  state: DatasetUpdateState,
  service: MedicationDetailService = {
    productDetail: vi.fn(async () => detail()),
  },
  route = '/medication/synthetic-product-id',
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MedicationDetailPage
        productId="synthetic-product-id"
        dataset={dataset(state)}
        detail={service}
      />
    </MemoryRouter>,
  );
}

const ready: DatasetUpdateState = {
  status: 'ready',
  generation: detail().generation,
};

it('shows loading without opening a reader while the local store is opening', () => {
  const productDetail = vi.fn(async () => detail());
  renderPage({ status: 'opening' }, { productDetail });

  expect(
    screen.getByRole('heading', { name: 'Loading medication detail' }),
  ).toBeVisible();
  expect(productDetail).not.toHaveBeenCalled();
});

it('shows why a product is absent from the active generation and preserves the search query', async () => {
  const productDetail = vi.fn(async () => null);
  renderPage(
    ready,
    { productDetail },
    '/medication/synthetic-product-id?q=Fictivol+detail',
  );

  expect(
    await screen.findByText(
      /This product was not found in the active local dataset/,
    ),
  ).toBeVisible();
  const backLink = screen.getByRole('link', {
    name: 'Back to results for Fictivol detail',
  });
  expect(backLink).toHaveAttribute(
    'href',
    `/search?${new URLSearchParams({ q: 'Fictivol detail' }).toString()}`,
  );
});

it.each([
  [
    'never-downloaded',
    { status: 'never-downloaded' } as const,
    'No medication dataset has been downloaded into this browser. Search is unavailable. This build has no dataset download control.',
  ],
  [
    'evicted',
    { status: 'evicted', generationId: 'generation-evicted' } as const,
    'The downloaded dataset is missing from this browser. It may have been evicted or deleted. Search is unavailable until data is restored.',
  ],
  [
    'storage-restricted',
    { status: 'storage-restricted' } as const,
    'This browser or profile restricts local storage. No medication dataset is available for search.',
  ],
  [
    'storage-unavailable',
    { status: 'storage-unavailable' } as const,
    'This browser does not expose a local database. Nothing can be stored or searched here.',
  ],
])('reuses the honest part A wording for %s data', (_name, state, message) => {
  const productDetail = vi.fn(async () => detail());
  renderPage(state, { productDetail });

  expect(screen.getByRole('status')).toHaveTextContent(message);
  expect(
    screen.getByRole('link', { name: 'Check dataset status' }),
  ).toHaveAttribute('href', '/status');
  expect(productDetail).not.toHaveBeenCalled();
});

it('reports a local read error without surfacing details and retries', async () => {
  const user = userEvent.setup();
  const productDetail = vi
    .fn<MedicationDetailService['productDetail']>()
    .mockRejectedValueOnce(new Error('synthetic local read failure'))
    .mockResolvedValueOnce(detail());
  renderPage(ready, { productDetail });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Medication detail could not be read. Try again or check dataset status.',
  );
  expect(
    screen.queryByText('synthetic local read failure'),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Retry medication detail' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Fictivol detail' }),
  ).toBeVisible();
  expect(productDetail).toHaveBeenCalledTimes(2);
});

it('reports damaged local records instead of blaming the source', async () => {
  renderPage(ready, {
    productDetail: vi.fn(async () => {
      throw new MedicationDetailIntegrityError('ATCCode');
    }),
  });

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(
    'Some locally stored records for this product are missing or damaged. The source may have provided them. Check dataset status.',
  );
  expect(screen.queryByText('Not provided by source')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry medication detail' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Check dataset status' }),
  ).toHaveAttribute('href', '/status');
});

it('renders source fields, composition, regulatory references and provenance verbatim', async () => {
  const item = detail();
  renderPage(ready, { productDetail: vi.fn(async () => item) });

  expect(
    await screen.findByRole('heading', { name: 'Fictivol detail' }),
  ).toBeVisible();
  for (const sectionName of [
    'Identification',
    'Composition',
    'ATC codes',
    'Manufacturers and marketing authorization holder',
    'Regulatory documents',
    'Source and dataset provenance',
  ])
    expect(
      screen.getByRole('heading', { name: sectionName, level: 2 }),
    ).toBeVisible();

  for (const exactText of [
    'CIM-FICTIONAL-17',
    'Source DCI text',
    '500,125 mg?',
    'fictional capsule form',
    'fictional-route-text',
    '10 fictional units',
    'AUTH-SYNTHETIC-17',
    '2026-09-17',
    'synthetic status text',
    'Fictional ingredient text from source',
    'Source DCI text',
    'Preferred fictitious name',
    'Fictional unresolved ingredient text',
    'SYN-DETAIL',
    'Synthetic illustrative class',
    'Fictional Holder',
    'Fictional RCP reference',
    'Fictional PIL reference',
    'ro-fictional',
    'edition-fictional-1',
    '2026-08-01T00:00:00Z',
    '2026-08-02T00:00:00Z',
    'Synthetic InterMED medication fixture',
    'none',
    'synthetic-detail-v1',
    '2026-10-02T00:00:00Z',
    '2026-10-05T00:00:00Z',
    '2026-10-03T00:00:00Z',
    'source-version-verbatim',
    '2026-09-01T00:00:00Z',
    '2026-10-01T00:00:00Z',
    'Synthetic dataset',
    'invalid-unit',
    'ambiguous-decimal',
    'Unresolved or ambiguous mapping',
  ])
    for (const element of screen.getAllByText(exactText, { exact: true }))
      expect(element).toBeVisible();

  expect(screen.getByText('Fictional Works, Imaginary Labs')).toBeVisible();

  expect(
    screen.getByText('illustrative, not an official classification', {
      exact: true,
    }),
  ).toBeVisible();
  expect(screen.getByText('2 days ago', { exact: true })).toBeVisible();
  expect(
    screen.getAllByText('Not provided by source', { exact: true }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getAllByText('unresolved', { exact: true }).length,
  ).toBeGreaterThan(0);
  const rcpLink = screen.getByRole('link', {
    name: 'Open source document in a new tab: RCP — Fictional RCP reference',
  });
  expect(rcpLink).toHaveAttribute(
    'href',
    'https://example.invalid/fictional/rcp',
  );
  expect(rcpLink).toHaveAttribute('target', '_blank');
  expect(rcpLink).toHaveAttribute('rel', 'noopener noreferrer');
  expect(
    screen.getByText(
      'A cached content reference is recorded. Its content is not displayed because approval to use cached documents has not been granted.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText('synthetic-cached-content-reference'),
  ).not.toBeInTheDocument();
});

it('states the source active-ingredient text before the individual ingredient rows', async () => {
  renderPage(ready, { productDetail: vi.fn(async () => detail()) });

  expect(
    await screen.findByRole('heading', { name: 'Fictivol detail' }),
  ).toBeVisible();
  const composition = screen.getByRole('region', { name: 'Composition' });
  expect(
    within(composition).getByText('Active ingredient(s) as stated by source'),
  ).toBeVisible();
  const sourceDci = within(composition).getByText('Original source DCI', {
    exact: true,
  });
  expect(sourceDci).toBeVisible();
  // The verbatim source text comes first; the individual rows follow it.
  const firstIngredientRow = within(composition).getAllByRole('listitem')[0]!;
  expect(
    sourceDci.compareDocumentPosition(firstIngredientRow) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(composition).getAllByRole('listitem').length).toBeGreaterThan(
    0,
  );
});

it('explains a composition that has source DCI text but no ingredient records', async () => {
  renderPage(ready, {
    productDetail: vi.fn(async () =>
      detail('active', {
        originalDciText: presentField('Synthetic verbatim source DCI text'),
        ingredients: [],
      }),
    ),
  });

  expect(
    await screen.findByRole('heading', { name: 'Fictivol detail' }),
  ).toBeVisible();
  const composition = screen.getByRole('region', { name: 'Composition' });
  expect(
    within(composition).getByText('Synthetic verbatim source DCI text'),
  ).toBeVisible();
  expect(
    within(composition).getByText(
      'No individual ingredient records are available in the local dataset.',
    ),
  ).toBeVisible();
  expect(
    within(composition).queryByText('Not provided by source'),
  ).not.toBeInTheDocument();
});

it('calls the composition missing only when the source provided neither', async () => {
  renderPage(ready, {
    productDetail: vi.fn(async () =>
      detail('active', { originalDciText: MISSING, ingredients: [] }),
    ),
  });

  expect(
    await screen.findByRole('heading', { name: 'Fictivol detail' }),
  ).toBeVisible();
  const composition = screen.getByRole('region', { name: 'Composition' });
  expect(
    within(composition).getByText('Active ingredient(s) as stated by source'),
  ).toBeVisible();
  expect(
    within(composition).getAllByText('Not provided by source', { exact: true })
      .length,
  ).toBeGreaterThan(0);
  expect(
    within(composition).queryByText(
      'No individual ingredient records are available in the local dataset.',
    ),
  ).not.toBeInTheDocument();
});

it('shows removed and unresolved catalogue banners clearly', async () => {
  const removed = detail('removed');
  const { rerender } = render(
    <MemoryRouter>
      <MedicationDetailPage
        productId="synthetic-product-id"
        dataset={dataset({ status: 'ready', generation: removed.generation })}
        detail={{ productDetail: vi.fn(async () => removed) }}
      />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(
      'This product is marked removed in the active local dataset.',
    ),
  ).toBeVisible();

  const unresolved = detail('unresolved');
  rerender(
    <MemoryRouter>
      <MedicationDetailPage
        productId="synthetic-product-id"
        dataset={dataset({
          status: 'ready',
          generation: unresolved.generation,
        })}
        detail={{ productDetail: vi.fn(async () => unresolved) }}
      />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(
      'This product record is unresolved in the active local dataset.',
    ),
  ).toBeVisible();
});

it('shows the document link as unavailable without an online connection', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const item = detail();
  renderPage(ready, { productDetail: vi.fn(async () => item) });

  expect(
    await screen.findByText(
      'This document link needs an internet connection. It is unavailable while offline.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', {
      name: /Open source document in a new tab: RCP/,
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Fictional RCP reference', { exact: true }),
  ).toBeVisible();
});
