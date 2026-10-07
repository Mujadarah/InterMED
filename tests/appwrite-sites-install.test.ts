import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appwriteConfigPaths,
  appwriteResources,
  loadAppwriteConfig,
  repositoryRoot,
} from './support/appwrite-config';

/** Working directory of the Sites build, as declared in the configuration. */
const siteRoot = 'apps/web';

/**
 * The directory an npm install command targets: its `--prefix` argument,
 * resolved from the site root like `path.resolve('apps/web', prefix)` from the
 * repository root. Without `--prefix` the command targets the site root.
 */
function installRoot(installCommand: string): string {
  const prefix =
    /(?:^|\s)--prefix[= ]("?)([^\s"]+)\1/.exec(installCommand)?.[2] ?? '.';
  return resolve(repositoryRoot, siteRoot, prefix);
}

describe('Sites install command', () => {
  for (const [environment, configPath] of Object.entries(appwriteConfigPaths)) {
    it(`installs the npm workspace root in ${environment}`, async () => {
      const config = await loadAppwriteConfig(configPath);
      const sites = appwriteResources(config).filter(
        (entry) => entry.kind === 'sites',
      );
      expect(sites.length).toBeGreaterThan(0);
      for (const { resource } of sites) {
        expect(resource.path, `${resource.$id} builds from the site root`).toBe(
          siteRoot,
        );
        const root = installRoot(String(resource.installCommand));
        expect(root, `${resource.$id} installs the npm workspace root`).toBe(
          repositoryRoot,
        );
        expect(
          existsSync(join(root, 'package-lock.json')),
          `${resource.$id} installs where the single root lockfile lives`,
        ).toBe(true);
      }
    });
  }
});
