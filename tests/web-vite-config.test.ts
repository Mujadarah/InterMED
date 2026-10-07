import { describe, expect, it } from 'vitest';
import { localStoreHarnessPlugin } from '../apps/web/vite.config';

describe('local-store harness Vite plugin', () => {
  it('does not include the harness in a production build even when the flag is inherited', () => {
    const plugin = localStoreHarnessPlugin('production', {
      INTERMED_LOCAL_STORE_HARNESS: '1',
    });
    const transform = plugin.transformIndexHtml;

    if (!transform || typeof transform !== 'object') {
      throw new Error('Expected an index HTML transform plugin');
    }

    expect(
      transform.handler.call(
        {} as ThisParameterType<typeof transform.handler>,
        '<html></html>',
        {} as Parameters<typeof transform.handler>[1],
      ),
    ).toEqual([]);
  });

  it('includes the harness only for the explicit harness mode', () => {
    const plugin = localStoreHarnessPlugin('harness', {
      INTERMED_LOCAL_STORE_HARNESS: '1',
    });
    const transform = plugin.transformIndexHtml;

    if (!transform || typeof transform !== 'object') {
      throw new Error('Expected an index HTML transform plugin');
    }

    expect(
      transform.handler.call(
        {} as ThisParameterType<typeof transform.handler>,
        '<html></html>',
        {} as Parameters<typeof transform.handler>[1],
      ),
    ).toEqual([
      {
        tag: 'script',
        attrs: {
          type: 'module',
          src: '/src/dev/local-store-harness.ts',
        },
        injectTo: 'head-prepend',
      },
    ]);
  });
});
