# task-b PR13 core — honest RED correction record

## Invalid failure in the original RED run (not defect proof)

`task-b-PR13-core-red.log` (original RED, 5 test files vs untouched
861fe81 production) shows `17 failed | 171 passed (188)`. One of the 17
failures was an INVALID test-harness error, not evidence of a production
defect:

- test: `handler-flow.test.ts > publish flows > does not report
already-published for a manifest row missing its canonical dataset
version id`
- error: `TypeError: sha256.hash is not a function` from
  `publicationRowId(...)` in `intent.js`
- cause: the probe called `publicationRowId(sha256Hex, id)` with the bare
  `sha256Hex` function, but `publicationRowId` expects the sha256 port
  object (`{ hash }`), like every other derivation call site.
- correction: the probe now uses `publicationRowId({ hash: sha256Hex },
id)` via the `sha256Port` fixture object.

The invalid failure is NOT counted as defect proof. The genuine defect
RED set from the original run is the other 16 failures (9 stage mixed
version keys, 2 publisher recovery loop, 1 intent quarantineReason, 1
handler large-removal explicit approval, 2 bridge legacy fallback, 1
bridge empty/malformed attribute).

## Corrected probe rerun vs original 861fe81 production

Corrected test commit: `6fff95f` (test corpus only; production
untouched at that commit). Rerun of the corrected corpus against
861fe81 production (`task-b-PR13-core-red-corrected.log`):

- `22 failed | 172 passed (194)`
- all 22 failures are genuine defect assertions; the corrected retry
  probe now fails on its real assertion (handler reports
  already-published for a manifest row without the canonical
  attribute) instead of the TypeError
- the 22 = 16 original genuine + the corrected retry probe + 5 present
  non-canonical parity negatives added after the root parity review
  (`task-b-PR13-core-red2.log` shows those 5 alone failing against the
  first bounded-only repair: `5 failed | 23 passed` in
  handler-bridge.test.ts)
- 172 controls green, including the next-generation fixture alignments
  (complete deliveries restamp all collection row keys and the optional
  envelope key to the declared version)

## Final state after fixes

- `task-b-PR13-core-green.log`: focused 6 files, `194 passed (194)`,
  exit 0
- `task-b-PR13-core-suite.log`: full importer suite excluding the
  reserved compiled artifact test, `367 passed (367)`, exit 0
- `task-b-PR13-core-gates.log`: format:check 0, lint 0, typecheck 0,
  check:boundaries 0
