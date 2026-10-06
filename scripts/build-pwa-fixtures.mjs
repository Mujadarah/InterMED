import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Real Vite builds A/B for updates, plus C for retention/consent regressions.
// Metadata differs by release; lifecycle tests use the emitted workers.
export default function buildPwaFixtures() {
  for (const revision of ['a', 'b', 'c']) {
    const result = spawnSync(
      process.execPath,
      [
        resolve('node_modules/vite/bin/vite.js'),
        'build',
        '--outDir',
        resolve(`artifacts/pwa-${revision}`),
      ],
      {
        cwd: resolve('apps/web'),
        env: { ...process.env, INTERMED_SHELL_REVISION: revision },
        encoding: 'utf8',
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Fixture build ${revision} failed: ${result.stdout}\n${result.stderr}`,
      );
  }
}
