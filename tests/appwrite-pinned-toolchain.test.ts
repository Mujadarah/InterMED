import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LINUX_X64_MUSL_ARTIFACT,
  assertSafeArchiveEntries,
  bootstrapInstallSpec,
  downloadAndExtractLinuxMuslNode,
  resolvePinnedPaths,
  resolveToolchainPaths,
} from '../infra/appwrite/pinned-toolchain.mjs';

const fixtureNodePath = join(tmpdir(), 'intermed-toolchain', 'node');
const fixtureNpmCliPath = join(
  tmpdir(),
  'intermed-toolchain',
  'npm',
  'bin',
  'npm-cli.js',
);

describe('Appwrite pinned toolchain launcher', () => {
  it('accepts absolute injected node and npm paths', () => {
    expect(
      resolvePinnedPaths({
        APPWRITE_PINNED_NODE: fixtureNodePath,
        APPWRITE_PINNED_NPM_CLI: fixtureNpmCliPath,
      }),
    ).toEqual({
      nodePath: fixtureNodePath,
      npmCliPath: fixtureNpmCliPath,
    });
  });

  it('rejects a relative path so PATH cannot select the toolchain', () => {
    expect(() =>
      resolvePinnedPaths({
        APPWRITE_PINNED_NODE: 'node',
        APPWRITE_PINNED_NPM_CLI: fixtureNpmCliPath,
      }),
    ).toThrow(/absolute/i);
  });

  it('rejects a requested version that is not the declared engine', () => {
    expect(() =>
      resolvePinnedPaths({
        APPWRITE_PINNED_NODE: fixtureNodePath,
        APPWRITE_PINNED_NPM_CLI: fixtureNpmCliPath,
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

  it('pins the official Node musl artifact for Linux x64', () => {
    expect(LINUX_X64_MUSL_ARTIFACT).toEqual({
      url: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64-musl.tar.gz',
      sha256:
        '3d63405fc65a0d2d2976c1f0bc2fd27bb0bd07212469e705aac3f03ae5ab4c9c',
      topFolder: 'node-v24.21.0-linux-x64-musl',
    });
    const spec = bootstrapInstallSpec('linux', 'x64');
    expect(spec.packages).toEqual(['npm@11.19.0']);
    expect(spec.nodePath).toMatch(
      /node-v24\.21\.0-linux-x64-musl[/\\]bin[/\\]node$/,
    );
  });

  it('rejects a prefix in the repository whose relative path starts with two dots', () => {
    const originalPrefix = process.env.APPWRITE_TOOLCHAIN_PREFIX;
    process.env.APPWRITE_TOOLCHAIN_PREFIX = resolve(
      process.cwd(),
      '..m3-prefix-probe',
    );

    try {
      expect(() => bootstrapInstallSpec('win32', 'x64')).toThrow(
        /outside the repository/i,
      );
    } finally {
      if (originalPrefix === undefined) {
        delete process.env.APPWRITE_TOOLCHAIN_PREFIX;
      } else {
        process.env.APPWRITE_TOOLCHAIN_PREFIX = originalPrefix;
      }
    }
  });

  it('allows a prefix in an outside sibling directory and restores the environment', () => {
    const originalPrefix = process.env.APPWRITE_TOOLCHAIN_PREFIX;
    process.env.APPWRITE_TOOLCHAIN_PREFIX = resolve(
      process.cwd(),
      '..',
      'm3-prefix-probe',
    );

    try {
      expect(() => bootstrapInstallSpec('win32', 'x64')).not.toThrow();
    } finally {
      if (originalPrefix === undefined) {
        delete process.env.APPWRITE_TOOLCHAIN_PREFIX;
      } else {
        process.env.APPWRITE_TOOLCHAIN_PREFIX = originalPrefix;
      }
    }

    expect(process.env.APPWRITE_TOOLCHAIN_PREFIX).toBe(originalPrefix);
  });

  it('refuses Linux arm64 without an exact verified official musl artifact', () => {
    expect(() => bootstrapInstallSpec('linux', 'arm64')).toThrow(
      /linux\/arm64.*musl.*artifact/i,
    );
  });

  it('rejects unsafe archive entries before extraction', () => {
    expect(() =>
      assertSafeArchiveEntries(
        [
          'node-v24.21.0-linux-x64-musl/bin/node',
          'node-v24.21.0-linux-x64-musl/../../outside',
        ],
        LINUX_X64_MUSL_ARTIFACT.topFolder,
      ),
    ).toThrow(/unsafe archive entry/i);
  });

  it('verifies the downloaded checksum before listing or extracting', async () => {
    const events: unknown[][] = [];
    const archive = new TextEncoder().encode('verified archive');
    await expect(
      downloadAndExtractLinuxMuslNode({
        prefix: 'C:\\outside\\toolchain',
        fetchImpl: async () => new Response(archive),
        artifact: Object.assign({}, LINUX_X64_MUSL_ARTIFACT, {
          sha256: 'wrong',
        }),
        runTar: (...args) => {
          events.push(args);
          return [];
        },
      }),
    ).rejects.toThrow(/checksum mismatch/i);
    expect(events).toEqual([]);
  });

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
