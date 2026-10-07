import { describe, expect, it } from 'vitest';
import {
  AmbiguousWriteError,
  boundedIssues,
  canonicalizeConfig,
  configIssues,
  ImporterConfigError,
  isAmbiguousWrite,
  isPublicationConflict,
  PublicationConflictError,
  assertValidConfig,
  type CanonicalImporterConfig,
} from '../../packages/importer/src/core';
import { testConfig } from './support/synthetic-raws';

describe('core config contract', () => {
  it('canonicalizes config consistently regardless of allowlist order', () => {
    expect(
      canonicalizeConfig({
        ...testConfig(),
        syntheticAllowlist: ['b', 'a'],
      }),
    ).toBe(
      canonicalizeConfig({
        ...testConfig(),
        syntheticAllowlist: ['a', 'b'],
      }),
    );
  });

  it('binds the parser encoding policy into the canonical config', () => {
    const utf8 = canonicalizeConfig(testConfig({ parserEncoding: 'utf-8' }));
    const alias = canonicalizeConfig(testConfig({ parserEncoding: 'UTF8' }));
    const windows = canonicalizeConfig(
      testConfig({ parserEncoding: 'windows-1250' }),
    );
    expect(alias).toBe(utf8);
    expect(windows).not.toBe(utf8);
  });

  it('rejects configs with non-finite or out-of-range bounds', () => {
    const cases: Array<Partial<CanonicalImporterConfig>> = [
      { maxRows: Number.NaN },
      { maxRows: -1 },
      { maxRows: 2.5 },
      { maxRawBytes: 0 },
      { largeRemovalCount: 0 },
      { largeRemovalPercent: 101 },
      { largeRemovalPercent: Number.POSITIVE_INFINITY },
      { parserEncoding: 'latin-1' },
      { sourceKey: ' padded ' },
      { syntheticAllowlist: [] },
    ];
    for (const overrides of cases) {
      expect(configIssues({ ...testConfig(), ...overrides })).not.toEqual([]);
      let caught: unknown;
      try {
        assertValidConfig({ ...testConfig(), ...overrides });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ImporterConfigError);
      expect((caught as ImporterConfigError).code).toBe('invalid-config');
    }
    expect(configIssues(testConfig())).toEqual([]);
  });

  it('bounds every issue list', () => {
    const many = Array.from(
      { length: 50 },
      (_, index) => `issue-${index}-${'x'.repeat(400)}`,
    );
    const bounded = boundedIssues(many);
    expect(bounded).toHaveLength(20);
    for (const issue of bounded) {
      expect(issue.length).toBeLessThanOrEqual(244);
    }
  });
});

describe('core error classification', () => {
  it('classifies conflicts and ambiguity by typed code, never by message', () => {
    expect(isPublicationConflict(new PublicationConflictError())).toBe(true);
    expect(
      isPublicationConflict(
        Object.assign(new Error('other'), { code: 'already-exists' }),
      ),
    ).toBe(true);
    expect(
      isPublicationConflict(
        new Error('The immutable publication object already exists'),
      ),
    ).toBe(false);
    expect(isAmbiguousWrite(new AmbiguousWriteError())).toBe(true);
    expect(
      isAmbiguousWrite(
        Object.assign(new Error('lost response'), { code: 'ambiguous-write' }),
      ),
    ).toBe(true);
    expect(isAmbiguousWrite(new Error('ambiguous-write'))).toBe(false);
    expect(isAmbiguousWrite(undefined)).toBe(false);
    expect(isPublicationConflict(null)).toBe(false);
  });
});
