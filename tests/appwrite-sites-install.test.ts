import { existsSync } from 'node:fs';
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
          expect(resource.installCommand).toBe('npm ci --no-fund');
          expect(resource.buildCommand).toBe(
            'npm run build --workspace @intermed/web',
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
});
