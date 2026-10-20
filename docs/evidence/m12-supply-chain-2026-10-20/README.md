# M12 supply-chain evidence (2026-10-20)

Scope: dependency and secret scanning plus output-sanitization audit for the
medication-core milestones. No new npm dependencies, no deployment, no live
Appwrite, no repository-settings changes. All paths below are relative to the
repository root.

## 1. Dependency audit gate

- Control: a CI step runs `npm audit --audit-level=high`, which fails on high
  or critical findings across all dependencies. The existing `npm run check`
  script already runs `npm audit --audit-level=low` (stricter), so the gate is
  enforced both in the dedicated step and in the full quality gate.
- Change: `.github/workflows/web-checks.yml`, step
  `Dependency audit (fail on high or critical)` inside the `verify` job.
- Local result (2026-10-20): `npm audit --audit-level=high` reports
  **found 0 vulnerabilities** (exit 0). No lockfile change was needed, so no
  fix was applied. Had anything high or critical appeared, the rule was to fix
  it only through a lockfile-only update within existing semver ranges, never
  with `npm audit fix --force`.

## 2. Dependency review on pull requests

- Control: GitHub's official `actions/dependency-review-action` runs on
  `pull_request` only with `fail-on-severity: high`, so a PR that introduces a
  highly vulnerable dependency fails before merge.
- Change: `.github/workflows/web-checks.yml`, new `dependency-review` job.
  It follows the pinning and permissions style already used in that file:
  least-privilege `contents: read` permissions, checkout with
  `persist-credentials: false`, and the action pinned to a full commit SHA
  with the release tag kept as a trailing comment.
- Pin: `2031cfc080254a8a887f58cffee85186f0e49e48` (`v4.9.0`). Verified through
  the public GitHub API object for the `v4` tag of
  `actions/dependency-review-action`, which returned this SHA with a verified
  signature, and cross-checked against the release notes listing the same
  short SHA for `v4.9.0`.

## 3. Dependabot

- Control: `.github/dependabot.yml` covers the `npm` ecosystem (repository
  root) and the `github-actions` ecosystem, on a weekly schedule, with minor
  and patch updates grouped and an open-PR limit of 5 per ecosystem.
- Note: the dependency-review pins use full SHAs with tag comments, so
  Dependabot can still propose updates to them in the normal way.

## 4. Sanitization audit

Method: searched `apps/web/src` and `packages` for `dangerouslySetInnerHTML`,
`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`,
`document.write`, and `href`/`src` built from data.

### 4.1 Guard test

- `tests/output-sanitization.test.ts`, suite `output-sanitization guard`.
- It enumerates production sources (`apps/web/src` and `packages`,
  source extensions only, `*.test.*` and `*.spec.*` excluded) and fails if
  any of the following appear: `dangerouslySetInnerHTML`, `innerHTML`,
  `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`,
  `new Function(`, or a `javascript:` URL scheme.
- The file carries an explicit allow-list (currently empty: no production
  sink is approved) with the documented entry format for the day a sink is
  ever truly needed.
- Local result: no violations found; no UI changes were needed.

### 4.2 `href` / `src` audit (manual, static list)

Only three dynamic `href` sites exist in production source; there are no
dynamic `src` attributes:

| Site                                                                 | Value source                                                                    | Why it is safe                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/presentation/App.tsx` (skip link)                      | Static `'#content'` fragment                                                    | No data involved                                                                                                                               |
| `apps/web/src/presentation/MedicationDetailPage.tsx` (`DocumentRow`) | `document.url` from the imported dataset                                        | Rendered only when `isHttpUrl()` accepts the value (`http:`/`https:` via the `URL` parser); otherwise the page states the URL cannot be opened |
| `apps/web/src/presentation/CalculatorsPage.tsx` (primary reference)  | Frozen domain formula constants (`https://doi.org/…`, `https://iris.who.int/…`) | Compile-time constants, never dataset or user input                                                                                            |

### 4.3 Inert-render test

- `tests/output-sanitization.test.ts`, test
  `renders script markup, event-handler markup and javascript: URLs as inert text`.
- It renders the real `MedicationDetailPage` with synthetic hostile data: a
  product name containing `<script>` and `<img onerror>` markup, and a
  regulatory-document URL using the `javascript:` scheme. It asserts that no
  `script` or `img` element is created, the markup appears only as literal
  text, no anchor carries the `javascript:` scheme, and the page shows the
  existing "cannot be opened" message for the refused URL.
- Product and interaction text elsewhere follows the same path: React JSX
  interpolation (for example `MedicationSearchPage` result rows), which
  escapes text by default. No `dangerouslySetInnerHTML` exists to bypass it.

### 4.4 Diagnostics and logging

Checked code (all relative paths):

- `apps/web/src/application/diagnostics.ts` — `buildDiagnosticsReport`
  constructs the report from an explicit allow-list (shell revision, runtime
  mode, schema/update state, dataset version identifiers and dates, formula
  identifiers and review status, storage byte counts, user agent). Dataset
  record text (product names, ingredient text, queries) is never read: the
  function signature accepts only snapshots and metadata, and the header
  comment states that source objects, preferences, and user inputs are never
  serialized.
- `apps/web/src/presentation/DiagnosticsSection.tsx` — the visible copy
  states the report holds "versions and browser storage information only"
  and names favorites, recent searches, medication names, and entered values
  as excluded.
- `tests/application/diagnostics.test.ts` — the
  `excludes seeded favorites, recent searches, viewed medication names and
extra free text from both exports` test seeds private values and asserts
  neither the JSON nor the text export contains them.
- Logging: a grep for `console.(log|warn|error|info|debug)` over
  `apps/web/src` and `packages` production sources returns no matches; the
  only matches in the repository are test harnesses and performance-measure
  logs using synthetic data. The search UI additionally reports read errors
  without echoing the query (`MedicationSearchPage.test.tsx`: `reports a
search error without displaying or logging the query`).

## 5. Secret hygiene

- `tests/secret-hygiene.test.ts` scans every tracked file (`git ls-files`)
  for AWS access-key shapes, PEM private-key block headers, the Appwrite key
  prefix carrying a value, GitHub classic and fine-grained token prefixes
  carrying values, and generic key assignments carrying long quoted values.
- Failure output prints only file and line number, never matched values.
- Pattern literals are assembled at runtime so the guard file itself carries
  no matchable shape. The explicit allow-list names only synthetic-fixture
  files (`tests/appwrite-config-secrets.test.ts`,
  `tests/scan-dist-secrets.test.ts`, `tests/support/secret-scan.ts`) plus
  this evidence file, each with a reason comment.
- Local result: no findings outside the allow-list. This complements (not
  replaces) the existing credential-shape detector tests, the public
  environment-example test, and the post-build bundle scan
  (`npm run scan:dist`).

## 6. What still needs the owner

Repository-settings changes were out of scope and were not made. Before any
public clinical release, the owner should enable in the hosting
repository settings:

1. GitHub secret scanning (alerts) for the repository.
2. Push protection against committed secrets.
3. Dependabot alerts and the requested review of the first grouped update PRs.
4. Required status checks including the new `Dependency review` job and the
   `Verify` job with the audit step.

DeepSource already runs a secrets check on PRs; the settings above are the
remaining platform-side controls.

## 7. Limitations

- `npm audit` and dependency review only know published advisories; they do
  not prove the absence of malicious or backdoored code, typosquatting, or
  build-time exfiltration. Pinned lockfile plus review of Dependabot diffs
  remains necessary.
- Dependency review covers dependency changes on pull requests; it does not
  rescan the full tree on pushes to `main`.
- The sanitization guard is syntactic: it bans known sinks and the
  `javascript:` scheme and proves inert rendering for the covered page, but
  it cannot prove that a future data flow into a new sink is safe. Any new
  dynamic `href`/`src` must repeat the manual audit in section 4.2.
- The secret guard scans tracked text files for known shapes; it cannot catch
  novel secret formats, secrets in history, or secrets in untracked build
  output (build output is covered separately by `npm run scan:dist`).
- One local-only failure is known and unrelated to this change:
  `tests/importer/artifact.test.ts` ("builds under the OS temp directory")
  fails in this environment; see the verification log below.

## 8. Verification log (2026-10-20)

Commands were run with the repository Node toolchain. Results:

- `npm audit --audit-level=high` — found 0 vulnerabilities.
- `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm run check:boundaries` — pass.
- `npx vitest run` — all suites pass except the known local-only
  `tests/importer/artifact.test.ts` temp-directory case.
- `npm run build` — pass, followed by the post-build bundle secret scan.
- New suites: `tests/output-sanitization.test.ts` (guard plus inert-render
  test) and `tests/secret-hygiene.test.ts` — pass.
