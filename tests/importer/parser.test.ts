import { describe, expect, it } from 'vitest';
import { decodeBytes } from '../../packages/importer/src/parser';
import { parseRawSnapshot } from '../../packages/importer/src/parser-facade';
import { ImporterConfigError } from '../../packages/importer/src/core';
import {
  buildRawDocument,
  encodeWindows1250,
  fictivolProduct,
  rawBytes,
  testConfig,
} from './support/synthetic-raws';

describe('decodeBytes', () => {
  it('decodes UTF-8 without BOM', () => {
    const text = 'hello';
    const bytes = new TextEncoder().encode(text);
    expect(decodeBytes(bytes, 'utf-8')).toBe(text);
  });

  it('strips a UTF-8 BOM before returning text', () => {
    const text = 'hello';
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode(text),
    ]);
    expect(decodeBytes(bytes, 'utf-8')).toBe(text);
  });

  it('decodes Windows-1250 legacy cedilla bytes to comma-below diacritics', () => {
    // 0xBA is legacy 'ş' and 0xFE is legacy 'ţ' in windows-1250.
    const bytes = new Uint8Array([
      0x53, 0x79, 0x6e, 0x74, 0x68, 0x65, 0x74, 0x69, 0x63, 0x61, 0x20, 0xba,
      0xfe,
    ]);
    expect(decodeBytes(bytes, 'windows-1250')).toBe('Synthetica șț');
  });

  it('preserves șțăâî and folds only legacy cedilla letters', () => {
    const text = 'Fictășâî-ță'; // mixed comma-below and correct vowels
    const bytes = new TextEncoder().encode(text);
    expect(decodeBytes(bytes, 'utf-8')).toBe(text);
    const legacy = 'Bucureşti'; // with legacy ş (U+015F)
    expect(decodeBytes(new TextEncoder().encode(legacy), 'utf-8')).toBe(
      'București',
    );
  });

  it('normalizes decomposed NFD diacritics to NFC', () => {
    const decomposed = 'Fictiva\u0306 a\u0302 i\u0302';
    const expected = 'Fictivă â î';
    const bytes = new TextEncoder().encode(decomposed);
    expect(decodeBytes(bytes, 'utf-8')).toBe(expected);
    expect(decodeBytes(bytes, 'utf-8')).toBe(
      decodeBytes(new TextEncoder().encode(expected), 'utf-8'),
    );
  });

  it('accepts encoding names case-insensitively', () => {
    const bytes = new TextEncoder().encode('Synthetica');
    expect(decodeBytes(bytes, 'UTF-8')).toBe('Synthetica');
    expect(decodeBytes(bytes, 'UTF8')).toBe('Synthetica');
  });

  it('throws on unsupported encoding', () => {
    const bytes = new Uint8Array([0x68]);
    expect(() => decodeBytes(bytes, 'latin-1')).toThrow('Unsupported encoding');
  });

  it('throws on invalid UTF-8 bytes', () => {
    const bytes = new Uint8Array([0xff, 0xff]);
    expect(() => decodeBytes(bytes, 'utf-8')).toThrow('Failed to decode bytes');
  });
});

function parseIssueList(result: { issues: string[] }): string {
  return result.issues.join('|');
}

describe('parseRawSnapshot envelope and bounds', () => {
  it('parses a complete envelope and sorts rows deterministically', () => {
    const document = buildRawDocument({
      products: [
        fictivolProduct(),
        {
          sourceProductId: 'SP-PLACEBEX',
          commercialName: 'Placebex',
          strengthText: '20 mg',
        },
      ],
    });
    document.products.reverse();
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    // Keys are case-folded by the key normalization policy; display text is not.
    expect(result.snapshot.products.map((row) => row.sourceProductId)).toEqual([
      'sp-fictivol',
      'sp-placebex',
    ]);
    expect(result.snapshot.products.map((row) => row.commercialName)).toEqual([
      'Fictivol',
      'Placebex',
    ]);
  });

  it('quarantines a non-object JSON root as invalid envelope', () => {
    const result = parseRawSnapshot(
      new TextEncoder().encode('[1,2,3]'),
      testConfig(),
    );
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('invalid-envelope');
  });

  it('quarantines an envelope without the synthetic format marker', () => {
    const document = {
      ...buildRawDocument({ products: [fictivolProduct()] }),
      format: 'unknown-format',
    };
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('invalid-envelope');
  });

  it('quarantines recordCounts that are not the canonical count keys', () => {
    const document = buildRawDocument({
      products: [fictivolProduct()],
      recordCounts: { products: 1, inventedRows: 4 },
    });
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('invalid-envelope');
  });

  it('quarantines forged, negative or fractional declared counts', () => {
    for (const value of [-1, 1.5, '2']) {
      const document = buildRawDocument({ products: [fictivolProduct()] });
      document.recordCounts.dosageForms = value as number;
      const result = parseRawSnapshot(rawBytes(document), testConfig());
      expect(result.status).toBe('quarantined');
      if (result.status !== 'quarantined') return;
      expect(result.reason).toBe('invalid-envelope');
    }
  });

  it('quarantines when declared counts do not describe the unique rows', () => {
    const document = buildRawDocument({
      products: [fictivolProduct()],
      recordCounts: {
        products: 2,
        activeIngredients: 1,
        medicationIngredients: 1,
        atcCodes: 0,
        dosageForms: 1,
        manufacturers: 0,
        marketingAuthorizationHolders: 0,
        regulatoryDocuments: 0,
      },
    });
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('count-mismatch');
  });

  it('enforces maxRows on actual rows even when declared counts are forged', () => {
    const products = Array.from({ length: 12 }, (_, index) => ({
      sourceProductId: `SP-ROW-${index}`,
      commercialName: `Row ${index}`,
    }));
    const document = buildRawDocument({
      products,
      recordCounts: {
        products: 1,
        activeIngredients: 0,
        medicationIngredients: 0,
        atcCodes: 0,
        dosageForms: 0,
        manufacturers: 0,
        marketingAuthorizationHolders: 0,
        regulatoryDocuments: 0,
      },
    });
    const result = parseRawSnapshot(
      rawBytes(document),
      testConfig({ maxRows: 5 }),
    );
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('row-bound-exceeded');
  });

  it('enforces maxRawBytes before decoding', () => {
    const document = buildRawDocument({ products: [fictivolProduct()] });
    const result = parseRawSnapshot(
      rawBytes(document),
      testConfig({ maxRawBytes: 8 }),
    );
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('oversized-snapshot');
  });

  it('collapses identical duplicate rows before the counts check', () => {
    const product = fictivolProduct();
    const document = buildRawDocument({ products: [product] });
    document.products.push({ ...document.products[0]! });
    document.recordCounts = {
      products: 1,
      activeIngredients: 1,
      medicationIngredients: 1,
      atcCodes: 0,
      dosageForms: 1,
      manufacturers: 0,
      marketingAuthorizationHolders: 0,
      regulatoryDocuments: 0,
    };
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.snapshot.products).toHaveLength(1);
    expect(result.issues).toContain('duplicate-identical-row:products');
  });

  it('fails closed on conflicting rows sharing one key', () => {
    const product = fictivolProduct();
    const document = buildRawDocument({ products: [product] });
    document.products.push({
      ...document.products[0]!,
      commercialName: 'Conflicting Name',
    });
    document.recordCounts = {
      products: 1,
      activeIngredients: 1,
      medicationIngredients: 1,
      atcCodes: 0,
      dosageForms: 1,
      manufacturers: 0,
      marketingAuthorizationHolders: 0,
      regulatoryDocuments: 0,
    };
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.reason).toBe('conflicting-duplicate');
    expect(parseIssueList(result)).toContain('conflicting-duplicate:products');
  });

  it('deduplicates rows keyed by source ingredient id as well', () => {
    const document = buildRawDocument({
      products: [fictivolProduct()],
    });
    const mapping = {
      sourceKey: 'source.fictivol',
      sourceIngredientId: 'MAP-1',
      mappingVersion: 'synthetic-1',
      reviewStatus: 'unreviewed' as const,
    };
    document.activeIngredients[0]!.externalMappings = [mapping, { ...mapping }];
    const result = parseRawSnapshot(rawBytes(document), testConfig());
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.snapshot.activeIngredients[0]!.externalMappings).toHaveLength(
      1,
    );
  });

  it('quarantines when the envelope contradicts the config source or schema', () => {
    const wrongSource = buildRawDocument({
      products: [fictivolProduct()],
      sourceKey: 'source.other',
    });
    const wrongSchema = buildRawDocument({
      products: [fictivolProduct()],
      schemaVersion: 'other-raw-9',
    });
    for (const document of [wrongSource, wrongSchema]) {
      const result = parseRawSnapshot(rawBytes(document), testConfig());
      expect(result.status).toBe('quarantined');
      if (result.status !== 'quarantined') return;
      expect(result.reason).toBe('config-envelope-mismatch');
    }
  });

  it('parses Windows-1250 snapshots under the config encoding policy', () => {
    const document = buildRawDocument({
      products: [
        {
          sourceProductId: 'SP-DIACRITIC',
          commercialName: 'Fictivă şînţă',
          strengthText: '10 mg',
        },
      ],
    });
    const bytes = encodeWindows1250(JSON.stringify(document));
    const result = parseRawSnapshot(
      bytes,
      testConfig({ parserEncoding: 'windows-1250' }),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.snapshot.products[0]!.commercialName).toBe('Fictivă șînță');
  });

  it('decodes the same non-ASCII snapshot deterministically', () => {
    const document = buildRawDocument({
      products: [
        {
          sourceProductId: 'SP-DIACRITIC',
          commercialName: 'Fictivă șînță âî',
        },
      ],
    });
    const bytes = rawBytes(document);
    const first = parseRawSnapshot(bytes, testConfig());
    const second = parseRawSnapshot(bytes, testConfig());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('finite validated config', () => {
  const document = buildRawDocument({ products: [fictivolProduct()] });

  it('rejects a config whose encoding policy is unsupported', () => {
    let caught: unknown;
    try {
      parseRawSnapshot(rawBytes(document), testConfig({ parserEncoding: 'x' }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ImporterConfigError);
    expect((caught as ImporterConfigError).code).toBe('invalid-config');
  });

  it('rejects non-finite or out-of-range config bounds', () => {
    for (const overrides of [
      { maxRows: Number.NaN },
      { maxRows: -1 },
      { maxRawBytes: 2.5 },
      { largeRemovalCount: 0 },
      { largeRemovalPercent: 120 },
    ]) {
      let caught: unknown;
      try {
        parseRawSnapshot(rawBytes(document), testConfig(overrides));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ImporterConfigError);
    }
  });
});
