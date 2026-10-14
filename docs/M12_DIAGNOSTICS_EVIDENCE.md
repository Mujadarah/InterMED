# M12 local diagnostics and privacy slice evidence

Date: 2026-10-14 (Europe/Bucharest). Nonclinical synthetic development scope only.

## Scope and commits

Executed the local worker brief (artifacts/handoffs/M12_DIAGNOSTICS_PRIVACY_BRIEF.md)
in D:/Proiecte AI/InterMED-wt/m12-diagnostics, branch claude/m12-diagnostics,
from base c4c48ee85f20b75c370f34ef6dc0e7e0d8e35d86. The brief is an ignored local
handoff; its scope is restated here so this evidence is usable from Git.

- e742a56: pure, injected, allowlisted diagnostics report and 9 regression tests.
- 7d4dbe1: status-page diagnostics, local copy/download controls, storage
  inspection, composition metadata, 12 UI/storage tests and browser coverage.
- This documentation commit: privacy documentation, README link, this record and
  sanitized verification/sample files.

The initial inventory loaded 69 Markdown files before implementation, including
the hidden PR template and local handoff. No controlling-document conflict was
identified for this nonclinical hardening slice. App.tsx changed by one import
and a six-line component invocation on /status. There are no new dependencies,
network calls, telemetry, accounts, Appwrite changes, clinical calculations or
provider approvals. No push, merge or deployment was performed.

## Test-first evidence and final checks

Pinned environment: Node 24.21.0, npm 11.19.0; INTERMED_NODE22_RUNTIME set to the
official Node 22.23.2 executable named in the brief. Dependency installation
completed with 0 audit vulnerabilities.

| Verification                               | Observed result                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Pure builder baseline                      | 9 tests failed against not-implemented behavior, then 9 passed                                                                    |
| UI and storage baseline                    | 12 tests failed against not-implemented behavior, then 12 passed                                                                  |
| Diagnostics route baseline                 | Section missing in all 3 browser projects before route wiring                                                                     |
| Complete shell browser suite               | 18 passed across Chromium desktop, WebKit phone and tablet                                                                        |
| Keyboard update regression                 | Fixed 12-Tab cap failed on all 3 projects after adding two buttons; control-count traversal then passed 3/3                       |
| Full required npm run check                | PASS, exit 0: 70 test files / 1,398 unit/component tests; 175 browser passed, 2 pre-existing skipped. All remaining gates passed. |
| Final documentation/whitespace/link checks | Formatting, local links and git diff whitespace checks passed; evidence/sample files are included in this documentation commit.   |

The unit exclusion regression seeds a real Dexie store through fake IndexedDB
with favorite IDs/names/version values and recent-search text/version values.
It verifies both exported formats contain none of them, and also rejects
accidentally over-supplied medication-name and free-text fields. UI tests cover
plain-text copy by keyboard, polite confirmation, missing/rejected clipboard,
JSON content/file naming and object-URL cleanup, download failure, live
dataset/shell subscriptions and storage metadata. Browser coverage checks
/status rendering, keyboard-triggered download, viewport fit and no external
requests observed in the production-shell test.

An initial full-check invocation omitted the Node22 variable: it passed 1,397
tests, then the compiled-artifact suite refused the missing environment.
The corrected first full run passed all 1,398 unit/component tests and later
failed the keyboard traversal helper in three browser projects (172 passed,
2 already skipped). The helper's bound now covers a full current control cycle;
all original focus, focus-visible, outline, other-tab and reload assertions
remain. No retries, timeout changes or new skips were added.

The two existing browser skips are the 20,000-product search measurement on
WebKit phone/tablet; that benchmark is Chromium-only in the existing test.
The OS-temp importer failure warned about in the brief did not reproduce in
the configured unit run. Its test and implementation were left unchanged.

## Review decisions and limitations

Independent fresh-context static review found no Critical or Important issue.
It did not claim physical-device, screen-reader or clinical acceptance.

- The schema number is the app's **supported** schema, accompanied by the
  dataset state. It does not invent an on-disk version for restricted or
  unsupported storage. Support readers must inspect both fields.
- The existing dataset-state contract exposes source IDs but no per-source
  upstream versions. No version is inferred from source IDs or catalogue
  versions; a future contract extension is needed for those fields.
- Optional published-endpoint settings are parsed but not wired to a browser
  reader/loader here. Privacy documentation must be revisited when that wiring
  changes.
- Deferred minor: the storage estimate is read when the status section mounts;
  later dataset/shell snapshots can have a newer report timestamp than that
  estimate. This limitation is disclosed in the privacy document. A refresh or
  separate measurement timestamp is deferred.
- Emulated Playwright coverage does not prove actual VoiceOver/Narrator behavior
  or physical iOS clipboard/download acceptance. Hosting-provider access logs,
  clinical approvals and unavailable upstream versions were not independently
  validated by this slice; maintainers retain those separate release gates.

## Files changed

- apps/web/src/application/diagnostic-formulas.ts
- apps/web/src/application/diagnostics.ts
- apps/web/src/application/services.ts
- apps/web/src/Bootstrap.tsx
- apps/web/src/infrastructure/browser-diagnostics.test.ts
- apps/web/src/infrastructure/browser-diagnostics.ts
- apps/web/src/presentation/App.tsx
- apps/web/src/presentation/DiagnosticsSection.test.tsx
- apps/web/src/presentation/DiagnosticsSection.tsx
- apps/web/src/presentation/styles.css
- docs/evidence/m12-diagnostics-2026-10-14/ (six verification/sample files)
- docs/M12_DIAGNOSTICS_EVIDENCE.md
- docs/PRIVACY.md
- README.md
- tests/application/diagnostics.test.ts
- tests/browser/keyboard-update.spec.ts
- tests/browser/shell.spec.ts

[Privacy documentation](PRIVACY.md) describes actual local stores, shell caches,
URL query exposure, network wiring, absence of telemetry/accounts,
export/delete scope, diagnostics sharing and ephemeral calculator evaluation.

## Synthetic diagnostics sample

Built by the actual pure report builder with injected synthetic snapshots,
formula metadata and approval entries; this is not a real device report.
Machine-readable and text files are retained with the verification evidence.

```text
InterMED diagnostics format version: 1
Generated at: 2026-10-14T00:00:00.000Z
App shell revision: synthetic-revision
Runtime mode: mock
Shell availability: ready
Shell version: synthetic-shell
Shell update state: none
Shell using prior: false
Local-store supported schema version: 1
Dataset update state: ready
Dataset failure reason: unavailable
Active dataset version id: synthetic-dataset-version-id
Active dataset version: synthetic-alpha
Dataset schema version: medication-catalogue-1
Dataset source ids: ["source.synthetic"]
Dataset published at: 2026-10-01T00:00:00.000Z
Dataset downloaded at: 2026-10-12T00:00:00.000Z
Dataset age (days since download): 2
Synthetic dataset (not for clinical use): true
Calculator pending component approvals: 9
Calculator bmi: {"formulaVersion":"formula=1.0.0|population=2.1.0|classification=2.0.0|presentation=2.0.0|confirmation=1.0.0","reviewStatus":"unreviewed","pendingApprovalCount":5}
Calculator bsa-mosteller: {"formulaVersion":"formula=1.0.0|population=2.1.0|presentation=2.0.0|confirmation=1.0.0","reviewStatus":"unreviewed","pendingApprovalCount":4}
Interaction provider: no approved provider
Storage usage (bytes, origin estimate): 1024
Storage quota (bytes, origin estimate): 4096
Storage persisted: false
User agent: SyntheticBrowser/1.0
```

## Evidence files

- [Final complete gate output](evidence/m12-diagnostics-2026-10-14/npm-run-check.log)
- [Builder red and green](evidence/m12-diagnostics-2026-10-14/builder-red-green.log)
- [UI/storage red and green](evidence/m12-diagnostics-2026-10-14/presentation-red-green.log)
- [Keyboard regression fix](evidence/m12-diagnostics-2026-10-14/keyboard-green.log)
- [Synthetic plain text](evidence/m12-diagnostics-2026-10-14/sample-diagnostics.txt)
- [Synthetic JSON](evidence/m12-diagnostics-2026-10-14/sample-diagnostics.json)

Logs use synthetic data. Personal checkout/tool paths are replaced with neutral
worktree/runtime labels; timestamps, exit results and test counts are preserved.
