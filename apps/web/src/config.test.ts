import { describe, expect, it } from 'vitest';
import { looksLikeCredential, parseConfig } from './config';

/**
 * Synthetic credential fixtures, assembled at runtime so no key-shaped literal
 * exists in this file for a secrets scanner to flag. Every value is fake and
 * only carries the shape under test.
 */
const syntheticStandardKey = ['standard', '_', 'f'.repeat(32)].join('');
const syntheticShortStandardKey = ['standard', '_', 'synthetic01'].join('');
const syntheticHexSecret = '01'.repeat(20);

describe('public configuration', () => {
  it('defaults to credential-free mock mode', () => {
    expect(parseConfig({})).toEqual({ mode: 'mock' });
  });
  it('rejects a live mode before it can enable external services', () => {
    expect(() => parseConfig({ VITE_RUNTIME_MODE: 'live' })).toThrow(
      'Invalid public configuration',
    );
  });
  it('rejects unknown public variables without echoing their values', () => {
    expect.assertions(2);
    try {
      parseConfig({ VITE_UNSUPPORTED_OPTION: 'unexpected-config-value' });
    } catch (error) {
      expect(String(error)).toContain('Invalid public configuration');
      expect(String(error)).not.toContain('unexpected-config-value');
    }
  });
  it('ignores unrelated host variables and accepts explicit mock mode', () => {
    expect(parseConfig({ PATH: 'host', VITE_RUNTIME_MODE: 'mock' })).toEqual({
      mode: 'mock',
    });
  });
});

describe('optional public reader identifiers', () => {
  const publicIdentifiers = {
    VITE_PUBLISHED_DATASETS_ENDPOINT: 'https://fra.cloud.appwrite.io/v1',
    VITE_APPWRITE_PROJECT_ID: 'intermed-dev',
    VITE_APPWRITE_PUBLISHED_BUCKET_ID: 'published-datasets',
  };

  it('accepts the public endpoint, project ID and bucket ID together', () => {
    expect(parseConfig(publicIdentifiers)).toEqual({
      mode: 'mock',
      publishedDatasets: {
        endpoint: 'https://fra.cloud.appwrite.io/v1',
        projectId: 'intermed-dev',
        publishedBucketId: 'published-datasets',
      },
    });
  });

  it('keeps credential-free mock mode when identifiers are set', () => {
    const config = parseConfig({
      ...publicIdentifiers,
      VITE_RUNTIME_MODE: 'mock',
    });
    expect(config.mode).toBe('mock');
  });

  it('rejects a partial reader configuration', () => {
    expect(() =>
      parseConfig({ VITE_APPWRITE_PROJECT_ID: 'intermed-dev' }),
    ).toThrow('Invalid public configuration');
    expect(() =>
      parseConfig({
        ...publicIdentifiers,
        VITE_APPWRITE_PUBLISHED_BUCKET_ID: undefined,
      }),
    ).toThrow('Invalid public configuration');
  });

  it('rejects non-https and credential-carrying endpoints', () => {
    for (const endpoint of [
      'http://fra.cloud.appwrite.io/v1',
      'https://user:pass@fra.cloud.appwrite.io/v1',
      'https://fra.cloud.appwrite.io/v1?key=value',
    ])
      expect(
        () =>
          parseConfig({
            ...publicIdentifiers,
            VITE_PUBLISHED_DATASETS_ENDPOINT: endpoint,
          }),
        endpoint,
      ).toThrow('Invalid public configuration');
  });

  it('rejects malformed identifiers', () => {
    for (const projectId of ['intermed dev', '-intermed', 'a'.repeat(40)])
      expect(
        () =>
          parseConfig({
            ...publicIdentifiers,
            VITE_APPWRITE_PROJECT_ID: projectId,
          }),
        projectId,
      ).toThrow('Invalid public configuration');
  });

  it('rejects credential-shaped values without echoing them', () => {
    expect.assertions(2);
    try {
      parseConfig({
        ...publicIdentifiers,
        VITE_APPWRITE_PROJECT_ID: syntheticShortStandardKey,
      });
    } catch (error) {
      expect(String(error)).toContain('Invalid public configuration');
      expect(String(error)).not.toContain(syntheticShortStandardKey);
    }
  });

  it('recognises credential shapes and ignores public identifiers', () => {
    for (const value of [
      syntheticStandardKey,
      syntheticHexSecret,
      'a1B2'.repeat(15),
    ])
      expect(looksLikeCredential(value), value).toBe(true);
    for (const value of [
      'intermed-dev',
      'published-datasets',
      'https://fra.cloud.appwrite.io/v1',
    ])
      expect(looksLikeCredential(value), value).toBe(false);
  });
});
