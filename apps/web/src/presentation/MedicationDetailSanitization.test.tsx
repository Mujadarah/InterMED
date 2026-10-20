// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { presentField, type MedicationProductDetail } from '@intermed/domain';
import {
  atc,
  document,
  dosageForm,
  emptyCatalogue,
  holder,
  manufacturer,
  product as makeProduct,
} from '../../../../tests/domain/builders';
import type { MedicationDetailService } from '../application/medication-detail';
import type { PreferencesService } from '../application/preferences';
import { MedicationDetailPage } from './MedicationDetailPage';

afterEach(() => {
  cleanup();
});

/**
 * Synthetic hostile payload assembled from parts. Nothing here is real
 * patient data or a real attack: it proves React interpolation keeps
 * imported product and interaction text inert.
 */
const hostileName = [
  'Fictivol ',
  '<',
  'script>alert(1)<',
  '/script><',
  'img src=x onerror=alert(2)>',
].join('');

const hostileUrl = ['java', 'script:', 'alert(1)'].join('');

function emptyPreferences(
  overrides: Partial<PreferencesService> = {},
): PreferencesService {
  return {
    listFavorites: async () => [],
    isFavorite: async () => false,
    addFavorite: async (input) => ({
      ...input,
      createdAt: '2026-10-09T00:00:00.000Z',
      status: 'unresolved',
    }),
    removeFavorite: async () => undefined,
    listRecentSearches: async () => [],
    recordOpenedSearch: async () => {
      throw new Error('Unexpected recent search');
    },
    clearRecentSearches: async () => undefined,
    exportPreferences: async (exportedAt) => ({
      format: 'intermed-preferences',
      version: 1,
      exportedAt,
      favorites: [],
      recentSearches: [],
    }),
    clearAllLocalData: async () => ({ status: 'cleared' }),
    ...overrides,
  };
}

function hostileDetail(): MedicationProductDetail {
  const form = dosageForm('DF-HOSTILE', 'fictional tablet');
  const code = atc('ATC-HOSTILE', 'SYN-HOSTILE');
  const maker = manufacturer('MF-HOSTILE', 'Synthetica Laboratories');
  const holderRecord = holder('MAH-HOSTILE', 'Fictional Holder');
  const catalogue = emptyCatalogue();
  const source = catalogue.dataSources[0];
  const version = catalogue.datasetVersions[0];
  if (!source || !version) throw new Error('Synthetic provenance is missing');
  const product = makeProduct('SP-HOSTILE', hostileName, {
    dosageFormId: presentField(form.id),
    atcCodeIds: [code.id],
    manufacturerIds: [maker.id],
    marketingAuthorizationHolderId: presentField(holderRecord.id),
  });
  const hostileDocument = {
    ...document('RD-HOSTILE', product.id),
    type: 'RCP' as const,
    title: presentField(hostileName),
    url: hostileUrl,
  };
  const generation = {
    generationId: 'generation-synthetic-hostile',
    dataset: 'synthetic-medication-catalogue',
    version: 'synthetic-hostile',
    schemaVersion: 'medication-catalogue-1',
    sourceIds: [source.id],
    publishedAt: '2026-10-02T00:00:00Z',
    importedAt: '2026-10-03T00:00:00Z',
    downloadedAt: '2026-10-12T00:00:00.000Z',
    checksum: 'synthetic-hostile-checksum',
    coverage: 'Fictional fixture only.',
    recordCounts: { products: 1 },
    synthetic: true,
  } as const;
  return {
    generation: { ...generation },
    product: {
      ...product,
      regulatoryDocumentIds: [hostileDocument.id],
    },
    ingredients: [],
    dosageForm: form,
    atcCodes: [code],
    manufacturers: [maker],
    marketingAuthorizationHolder: holderRecord,
    regulatoryDocuments: [hostileDocument],
    dataSource: source,
    datasetVersion: { ...version, version: 'synthetic-hostile' },
  };
}

describe('hostile imported text stays inert', () => {
  it('renders script markup, event-handler markup and javascript: URLs as inert text', async () => {
    const item = hostileDetail();
    const state = { status: 'ready', generation: item.generation } as const;
    const dataset = { getState: () => state, subscribe: () => () => {} };
    const service: MedicationDetailService = {
      productDetail: async () => item,
    };
    const { container } = render(
      <MemoryRouter initialEntries={['/medication/synthetic-hostile']}>
        <MedicationDetailPage
          productId="synthetic-hostile"
          dataset={dataset}
          detail={service}
          preferences={emptyPreferences()}
        />
      </MemoryRouter>,
    );

    // The hostile product name is displayed literally, not parsed as HTML.
    const headings = await screen.findAllByRole('heading', {
      name: /Fictivol/,
    });
    expect(headings).toHaveLength(2);
    for (const heading of headings) expect(heading).toBeVisible();
    // The raw markup survives only as escaped text content.
    expect(container.querySelector('h1')?.textContent).toContain('<script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();

    // The javascript: document URL is refused: no anchor carries the scheme,
    // and the page explains the link cannot be opened.
    expect(
      await screen.findByText(
        'This document URL cannot be opened from this page.',
      ),
    ).toBeVisible();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    for (const anchor of Array.from(container.querySelectorAll('a[href]'))) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/javascript\s*:/i);
    }
  });
});
