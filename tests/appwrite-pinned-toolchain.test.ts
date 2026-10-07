import { describe, expect, it } from 'vitest';
import {
  bootstrapInstallSpec,
  resolvePinnedPaths,
  resolveToolchainPaths,
} from '../infra/appwrite/pinned-toolchain.mjs';

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

  it('bootstraps the direct Windows Node binary package without lifecycle hooks', () => {
    expect(bootstrapInstallSpec('win32', 'x64')).toEqual({
      packages: [`node-win-x64@24.21.0`, `npm@11.19.0`],
      npmArgs: expect.arrayContaining([
        '--ignore-scripts',
        '--package-lock=false',
      ]),
      nodePath: expect.stringMatching(
        /node_modules[\\/]node-win-x64[\\/]bin[\\/]node\.exe$/,
      ),
      npmCliPath: expect.stringMatching(
        /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/,
      ),
    });
  });

  it.each([
    ['linux', 'x64', 'node-linux-x64', 'node'],
    ['linux', 'arm64', 'node-linux-arm64', 'node'],
  ] as const)(
    'selects the supported %s/%s direct Node package',
    (platform, arch, packageName, binaryName) => {
      expect(bootstrapInstallSpec(platform, arch).packages[0]).toBe(
        `${packageName}@24.21.0`,
      );
      expect(bootstrapInstallSpec(platform, arch).nodePath).toMatch(
        new RegExp(
          `node_modules[/\\\\]${packageName}[/\\\\]bin[/\\\\]${binaryName}$`,
        ),
      );
    },
  );

  it('refuses unsupported platform and architecture combinations explicitly', () => {
    expect(() => bootstrapInstallSpec('darwin', 'x64')).toThrow(
      /unsupported.*darwin\/x64/i,
    );
  });

  it('uses the pinned npm wrapper directory before the host PATH', () => {
    const paths = resolveToolchainPaths(
      'C:\\toolchain\\node_modules\\node-win-x64\\bin\\node.exe',
      'C:\\toolchain\\node_modules\\npm\\bin\\npm-cli.js',
      'C:\\host\\node_modules\\.bin;C:\\host',
      'win32',
    );
    expect(paths).toBe(
      'C:\\toolchain\\node_modules\\.bin;C:\\toolchain\\node_modules\\node-win-x64\\bin;C:\\host\\node_modules\\.bin;C:\\host',
    );
  });
});
