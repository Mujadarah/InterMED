import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appwriteConfigPaths,
  appwriteResources,
  loadAppwriteConfig,
  repositoryRoot,
} from './support/appwrite-config';

/**
 * Resolves the working directory for a site's build and install steps.
 *
 * For the CLI 28.1.0 development variant, the path is resolved relative to the
 * config file directory (`infra/appwrite`), matching CLI 28.1.0
 * `ResolveResourcePath("sites", path)`.
 *
 * For the documented per-app production variant, the path is resolved relative
 * to the repository root (representing the Git repository root directory).
 */
function siteWorkingDir(
  environment: string,
  configRelativePath: string,
  sitePath: string,
): string {
  if (environment === 'development') {
    const configDir = dirname(join(repositoryRoot, configRelativePath));
    return resolve(configDir, sitePath);
  }
  return resolve(repositoryRoot, sitePath);
}

/**
 * Resolves the target directory of an npm install command:
 * its `--prefix` argument if present, or the site working directory itself.
 */
function installRoot(workingDir: string, installCommand: string): string {
  const prefix = /(?:^|\s)--prefix[= ]("?)([^\s"]+)\1/.exec(
    installCommand,
  )?.[2];
  return prefix ? resolve(workingDir, prefix) : workingDir;
}

/**
 * Resolves the build output directory from the site working directory.
 */
function outputRoot(workingDir: string, outputDirectory: string): string {
  return resolve(workingDir, outputDirectory);
}

/**
 * Match the repository's path-only archive rules with Node's native glob
 * implementation. Directory rules match descendants, and later negated rules
 * restore paths in the same way as the configured ignore list.
 */
function archiveRuleMatches(path: string, rule: string): boolean {
  const pattern = rule.startsWith('!') ? rule.slice(1) : rule;
  const segments = path.split('/');
  const candidates = segments.flatMap((_, start) =>
    segments
      .slice(start)
      .map((_, end) => segments.slice(start, start + end + 1).join('/')),
  );

  return candidates.some((candidate) => matchesGlob(candidate, pattern));
}

function archivePathIsIgnored(path: string, rules: readonly string[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (archiveRuleMatches(path, rule)) ignored = !rule.startsWith('!');
  }
  return ignored;
}

describe('Sites configuration and install commands', () => {
  for (const [environment, configPath] of Object.entries(appwriteConfigPaths)) {
    it(`resolves concrete site settings correctly in ${environment}`, async () => {
      const config = await loadAppwriteConfig(configPath);
      const sites = appwriteResources(config).filter(
        (entry) => entry.kind === 'sites',
      );
      expect(sites.length).toBeGreaterThan(0);

      for (const { resource } of sites) {
        const workingDir = siteWorkingDir(
          environment,
          configPath,
          String(resource.path),
        );
        const installDir = installRoot(
          workingDir,
          String(resource.installCommand),
        );
        const buildOutputDir = outputRoot(
          workingDir,
          String(resource.outputDirectory),
        );

        if (environment === 'development') {
          expect(resource.$id).toBe('intermed-web-dev');
          expect(resource.name).toBe('InterMED web (development)');
          expect(resource.path).toBe('../..');
          expect(workingDir).toBe(repositoryRoot);
          expect(resource.installCommand).toBe(
            'node infra/appwrite/pinned-toolchain.mjs install',
          );
          expect(resource.buildCommand).toBe(
            'node infra/appwrite/pinned-toolchain.mjs build',
          );
          expect(resource.outputDirectory).toBe('./apps/web/dist');
        } else {
          expect(resource.$id).toBe('intermed-web-prod');
          expect(resource.name).toBe('InterMED web (production)');
          expect(resource.path).toBe('apps/web');
          expect(workingDir).toBe(resolve(repositoryRoot, 'apps/web'));
          expect(resource.installCommand).toBe(
            'npm ci --prefix ../.. --no-fund',
          );
          expect(resource.buildCommand).toBe('npm run build');
          expect(resource.outputDirectory).toBe('./dist');
        }

        expect(resource.framework).toBe('other');
        expect(resource.adapter).toBe('static');
        expect(resource.buildRuntime).toBe('node-22');
        expect(resource.fallbackFile).toBe('index.html');
        expect(resource.enabled).toBe(true);
        expect(resource.logging).toBe(true);

        expect(
          installDir,
          `${resource.$id} installs the npm workspace root`,
        ).toBe(repositoryRoot);
        expect(
          existsSync(join(installDir, 'package-lock.json')),
          `${resource.$id} installs where the single root lockfile lives`,
        ).toBe(true);
        expect(
          buildOutputDir,
          `${resource.$id} resolves output directory to apps/web/dist`,
        ).toBe(resolve(repositoryRoot, 'apps/web/dist'));
      }
    });
  }

  it('verifies the pinned toolchain wrapper for the configured host runtime', async () => {
    // Read root package.json engines and .npmrc.
    const pkgJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { engines?: { node?: string; npm?: string } };
    const npmrc = readFileSync(join(repositoryRoot, '.npmrc'), 'utf8');

    expect(pkgJson.engines?.node).toBe('24.21.0');
    expect(pkgJson.engines?.npm).toBe('11.19.0');
    expect(npmrc).toContain('engine-strict=true');

    // The development site uses the explicit-path launcher to provide the exact
    // declared toolchain without relying on the runner's PATH.
    const devConfig = await loadAppwriteConfig(appwriteConfigPaths.development);
    const devSite = appwriteResources(devConfig).find(
      (entry) =>
        entry.kind === 'sites' && entry.resource.$id === 'intermed-web-dev',
    )?.resource;
    expect(devSite).toBeDefined();

    const expectedInstallCommand =
      'node infra/appwrite/pinned-toolchain.mjs install';
    const expectedBuildCommand =
      'node infra/appwrite/pinned-toolchain.mjs build';

    expect(devSite?.installCommand).toBe(expectedInstallCommand);
    expect(devSite?.buildCommand).toBe(expectedBuildCommand);
    expect(devSite?.buildRuntime).toBe('node-22');

    expect(devSite?.installCommand).not.toContain('npx');
    expect(devSite?.buildCommand).not.toContain('npx');

    const launcher = readFileSync(
      join(repositoryRoot, 'infra/appwrite/pinned-toolchain.mjs'),
      'utf8',
    );
    expect(launcher).toContain('APPWRITE_HOST_NPM');
    expect(launcher).toContain('APPWRITE_PINNED_NODE');
    expect(launcher).toContain('APPWRITE_PINNED_NPM_CLI');
    expect(launcher).toContain('process.env.PATH');
    expect(launcher).toContain("'ci', '--no-fund'");
  });

  it('applies the development site archive exclusions without hiding source files', async () => {
    const devConfig = await loadAppwriteConfig(appwriteConfigPaths.development);
    const devSite = appwriteResources(devConfig).find(
      (entry) =>
        entry.kind === 'sites' && entry.resource.$id === 'intermed-web-dev',
    )?.resource;
    expect(devSite).toBeDefined();

    const ignoreRules = devSite?.ignore;
    expect(ignoreRules).toEqual([
      '.git',
      '**/.git',
      'node_modules',
      '**/node_modules',
      '.tools',
      '**/.tools',
      'artifacts',
      '**/artifacts',
      '.env*',
      '**/.env*',
      '!.env.example',
      '!**/.env.example',
      'dist',
      '**/dist',
      'coverage',
      '**/coverage',
      'playwright-report',
      '**/playwright-report',
      'test-results',
      '**/test-results',
      '.aws',
      '**/.aws',
      '.codex',
      '**/.codex',
      '.agents',
      '**/.agents',
      '.claude',
      '**/.claude',
      '.worktrees',
      '**/.worktrees',
    ]);
    expect(ignoreRules).toBeDefined();

    const ignoredPaths = [
      '.git/config',
      'node_modules/example/index.js',
      '.tools/cache',
      'artifacts/build/index.html',
      '.env.local',
      'apps/web/.env.production',
      'dist/index.html',
      'coverage/index.html',
      'playwright-report/index.html',
      'test-results/results.json',
      '.aws/credentials',
      '.codex/session.json',
      '.agents/local.json',
      '.claude/settings.json',
      'apps/web/.claude/settings.json',
      '.worktrees/feature/apps/web/src/main.tsx',
      'packages/domain/.worktrees/feature/src/index.ts',
    ];
    const sourcePaths = [
      'package.json',
      'package-lock.json',
      '.npmrc',
      'apps/web/package.json',
      'apps/web/.env.example',
      'apps/web/src/main.tsx',
      'packages/domain/src/index.ts',
    ];

    for (const path of ignoredPaths) {
      expect(
        archivePathIsIgnored(path, ignoreRules as string[]),
        `${path} should be ignored`,
      ).toBe(true);
    }
    for (const path of sourcePaths) {
      expect(
        archivePathIsIgnored(path, ignoreRules as string[]),
        `${path} should remain archivable`,
      ).toBe(false);
    }
  });
});
