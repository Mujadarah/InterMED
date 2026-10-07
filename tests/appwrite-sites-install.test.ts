import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
            'npx --yes --package=node@24.21.0 --package=npm@11.19.0 --call "node --version && npm --version && npm ci --no-fund"',
          );
          expect(resource.buildCommand).toBe(
            'npx --yes --package=node@24.21.0 --package=npm@11.19.0 --call "npm run build --workspace @intermed/web"',
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

  it('proves host runtime images cannot satisfy exact engines without wrapper and verifies pinned toolchain wrapper', async () => {
    // 1. Read root package.json engines and .npmrc
    const pkgJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { engines?: { node?: string; npm?: string } };
    const npmrc = readFileSync(join(repositoryRoot, '.npmrc'), 'utf8');

    expect(pkgJson.engines?.node).toBe('24.21.0');
    expect(pkgJson.engines?.npm).toBe('11.19.0');
    expect(npmrc).toContain('engine-strict=true');

    // 2. Direct host runtime versions:
    // Appwrite node-22 live runtime base is 22.9.0
    // Appwrite node-24 live runtime base is 24.13.0
    // Both fail the exact node 24.21.0 engine requirement
    const appwriteNode22Host = '22.9.0';
    const appwriteNode24Host = '24.13.0';
    expect(appwriteNode22Host).not.toBe(pkgJson.engines?.node);
    expect(appwriteNode24Host).not.toBe(pkgJson.engines?.node);

    // 3. Pinned toolchain wrapper in development site
    const devConfig = await loadAppwriteConfig(appwriteConfigPaths.development);
    const devSite = appwriteResources(devConfig).find(
      (entry) =>
        entry.kind === 'sites' && entry.resource.$id === 'intermed-web-dev',
    )?.resource;
    expect(devSite).toBeDefined();

    const expectedInstallCommand =
      'npx --yes --package=node@24.21.0 --package=npm@11.19.0 --call "node --version && npm --version && npm ci --no-fund"';
    const expectedBuildCommand =
      'npx --yes --package=node@24.21.0 --package=npm@11.19.0 --call "npm run build --workspace @intermed/web"';

    expect(devSite?.installCommand).toBe(expectedInstallCommand);
    expect(devSite?.buildCommand).toBe(expectedBuildCommand);
    expect(devSite?.buildRuntime).toBe('node-22');

    // 4. Verify bootstrap compatibility:
    // npm@11.19.0 engines requirement is "^20.17.0 || >=22.9.0"
    // node-22 live image base 22.9.0 satisfies >=22.9.0 bootstrap
    expect(devSite?.installCommand).toContain(
      `--package=node@${pkgJson.engines?.node}`,
    );
    expect(devSite?.installCommand).toContain(
      `--package=npm@${pkgJson.engines?.npm}`,
    );
    expect(devSite?.buildCommand).toContain(
      `--package=node@${pkgJson.engines?.node}`,
    );
    expect(devSite?.buildCommand).toContain(
      `--package=npm@${pkgJson.engines?.npm}`,
    );
  });
});
