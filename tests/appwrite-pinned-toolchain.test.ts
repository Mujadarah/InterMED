import { describe, expect, it } from 'vitest';
import { resolvePinnedPaths } from '../infra/appwrite/pinned-toolchain.mjs';

describe('Appwrite pinned toolchain launcher', () => {
  it('accepts absolute injected node and npm paths', () => {
    expect(
      resolvePinnedPaths({
        APPWRITE_PINNED_NODE: 'C:\\toolchain\\node.exe',
        APPWRITE_PINNED_NPM_CLI: 'C:\\toolchain\\npm\\bin\\npm-cli.js',
      }),
    ).toEqual({
      nodePath: 'C:\\toolchain\\node.exe',
      npmCliPath: 'C:\\toolchain\\npm\\bin\\npm-cli.js',
    });
  });

  it('rejects a relative path so PATH cannot select the toolchain', () => {
    expect(() =>
      resolvePinnedPaths({
        APPWRITE_PINNED_NODE: 'node',
        APPWRITE_PINNED_NPM_CLI: 'C:\\toolchain\\npm\\bin\\npm-cli.js',
      }),
    ).toThrow(/absolute/i);
  });

  it('rejects a requested version that is not the declared engine', () => {
    expect(() =>
      resolvePinnedPaths({
        APPWRITE_PINNED_NODE: 'C:\\toolchain\\node.exe',
        APPWRITE_PINNED_NPM_CLI: 'C:\\toolchain\\npm\\bin\\npm-cli.js',
        APPWRITE_NODE_VERSION: '22.23.2',
      }),
    ).toThrow(/24\.21\.0/);
  });
});
