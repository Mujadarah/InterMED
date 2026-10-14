# Precache budget evidence — 2026-10-14

Local synthetic-only verification in the precache-budget worktree, on branch
`claude/precache-budget`, from baseline `8c913c1`. No push or deployment.
Node 24.21.0 / npm 11.19.0; Node 22.23.2 supplied through
`INTERMED_NODE22_RUNTIME`. Machine paths and ANSI color codes in logs are redacted; trailing whitespace
and excess EOF blank lines are normalized. Measurements and failure messages
are retained. All 68 baseline repository Markdown
files, including hidden `.github` content, plus the handoff brief were read
before edits; no controlling conflict was found.

## Measurements and test-first evidence

- [measurement.json](measurement.json): all 15 asset URLs and sizes, total
  593,664 bytes, cap 24 assets / 2,097,152 bytes, nine spare slots and
  1,503,488 spare bytes. Baseline and final default-revision identities included.
- [npm-ci.log](npm-ci.log): pinned install succeeded, zero audit vulnerabilities.
- [unit-red.log](unit-red.log): before implementation, four intended failures
  (build 24-asset acceptance; byte-budget diagnostic; headroom diagnostic;
  worker 24-asset readiness), 88 passing tests.
- [pwa-green.log](pwa-green.log): after implementation, 95/95 PWA/build tests.
- [initial-unit-suite.log](initial-unit-suite.log): initial complete unit run,
  1,382 passed and one repository path-hygiene timeout (5,000 ms).
- [pwa-and-hygiene-green.log](pwa-and-hygiene-green.log): focused PWA/build and
  hygiene rerun passed 98/98. No timeout or hygiene assertion was changed.
- [latency-old-cap-red.log](latency-old-cap-red.log): temporarily restoring only
  the former 16-entry worker limit made both full-cap Chromium scenarios lose
  readiness. The 24-entry implementation was restored before green runs.
- [build.log](build.log): production build succeeds and prints count, bytes and
  remaining budgets. Asset bytes are unchanged; worker policy changes identity.

## Browser repetition

[cache-repeat5.log](cache-repeat5.log): **480/480 passed**, 4.2 minutes, across
`chromium-desktop`, `webkit-phone` and `webkit-tablet`. Command:

`npx playwright test tests/browser/slow-cache.spec.ts tests/browser/review-regressions.spec.ts tests/browser/pwa-lifecycle.spec.ts tests/browser/storage-recovery.spec.ts tests/browser/eviction-recovery.spec.ts tests/browser/recovery-update.spec.ts tests/browser/activation-failure.spec.ts tests/browser/native-activation.spec.ts tests/browser/https-shell.spec.ts --repeat-each=5`

The eight existing matched spec files produced 32 cases per project per repeat.
The supplied `https-shell.spec.ts` selector matched no file and contributed no
cases; this run makes no TLS claim. The latency cases explicitly counted 24
cached assets and retained the original 400 ms cache-read delay / 3,000 ms race.

The latency test was then strengthened to take the server offline after cache
installation, preventing a network fallback from satisfying the JavaScript
assertion. [latency-offline-repeat5.log](latency-offline-repeat5.log): **30/30
passed**, 26.4 seconds, all three projects, with:

`npx playwright test tests/browser/slow-cache.spec.ts --repeat-each=5`

The test-only server pads the emitted real release with unique pinned synthetic
JavaScript assets and recomputes its policy/asset release identity. Production
output receives no padding. Existing integrity/update tests are unchanged, and
browser retries, worker count and readiness deadlines are unchanged.

## Full gate

[check.log](check.log): exact required `npm run check`, **exit 0**. All formatting,
lint, typecheck, **1,383/1,383 unit tests**, architecture boundaries, audit (zero
vulnerabilities), production build and distribution scanning passed. Full
browser results: **172 passed / 2 existing skips**, 2.1 minutes. The two skips are the existing phone/tablet WebKit exclusions for the
Chromium-only 20,000-product search benchmark; no skip was added or changed. The earlier path-hygiene timeout did not recur.

The handoff's known importer test, "builds under the OS temp directory…", did
not fail in these unit runs. No importer fix was attempted. Existing environment
warnings (deprecated ESLint release; FORCE_COLOR/NO_COLOR conflict) are preserved
in the logs and did not fail the gate.

## Limits

Synthetic cache latency is not a real-device performance measurement. The
full-cap fixture exercises 24 assets with the current build's byte load, not a
worst-case 2 MiB shell. The expected two future route chunks are not merged here;
seven spare asset slots after both is conditional on one added asset per page.
The final integrated shell must pass the same count and byte budgets.
