import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

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
