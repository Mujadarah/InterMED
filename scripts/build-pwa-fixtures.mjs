import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Real Vite builds A/B for updates, plus C for retention/consent regressions.
// Metadata differs by release; lifecycle tests use the emitted workers.
// A fourth build adds the test-only local-store harness; it is never shipped.
/** Build independent public A/B/C HTML, JavaScript and worker releases; fail setup on build errors. */
export default function buildPwaFixtures() {
  for (const revision of ['a', 'b', 'c', 'harness']) {
    const result = spawnSync(
      process.execPath,
      [
        resolve('node_modules/vite/bin/vite.js'),
        'build',
        '--outDir',
        resolve(`artifacts/pwa-${revision}`),
        ...(revision === 'harness' ? ['--mode', 'harness'] : []),
      ],
      {
        cwd: resolve('apps/web'),
        env: {
          ...process.env,
          INTERMED_SHELL_REVISION: revision,
          ...(revision === 'harness'
            ? { INTERMED_LOCAL_STORE_HARNESS: '1' }
            : {}),
        },
        encoding: 'utf8',
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Fixture build ${revision} failed: ${result.stdout}\n${result.stderr}`,
      );
  }
}
