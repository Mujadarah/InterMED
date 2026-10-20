# M12 accessibility, responsive and touch audit — evidence (2026-10-20)

Branch `claude/m12-a11y-audit`, from `origin/main`. Automated only, no new
dependencies: the new spec uses Playwright 1.63 built-ins
(`toMatchAriaSnapshot`, `getByRole`, `page.setViewportSize`,
`locator.boundingBox`, keyboard) and the existing
`tests/browser/production-server.ts` helper. No clinical text, calculator
logic, or interaction domain was changed.

## Per-route matrix (check x route x project)

Projects: `chromium-desktop`, `webkit-phone`, `webkit-tablet`. Every cell is
`pass`. `fixed` marks cells that failed before the minimal UI fixes below and
pass after; there are no `fixme` cells.

| Check                                                                                             | home `/`             | search `/search` | detail `/medication/:id`      | favorites `/favorites`        | calculators `/calculators`                         | status `/status` |
| ------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ----------------------------- | ----------------------------- | -------------------------------------------------- | ---------------- |
| Exactly one `main`, single `h1` (aria snapshot pins role+name+level), no skipped heading levels   | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| Every form control has an accessible name; every button has a name; images have alt text          | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| Skip link works, focus lands on main                                                              | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| Tab reaches every control in DOM order, focus indicator changes from the unfocused state, no trap | pass x3              | pass x3          | fixed x3 (phone+tablet links) | fixed x3 (phone+tablet links) | fixed x3 (phone focus ring; all projects overflow) | pass x3          |
| No horizontal scroll at 320x640, no off-screen boxes, no text cropped by `overflow: hidden/clip`  | pass x3              | pass x3          | pass x3                       | pass x3                       | fixed x3 (formula version wrap)                    | pass x3          |
| Touch targets >= 44x44 on phone (primary fail, inline report-only)                                | fixed (brand 42.2px) | pass             | pass                          | pass                          | pass                                               | pass             |
| `prefers-reduced-motion: reduce` disables transitions/animations (none exist)                     | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| `lang` present on `<html>`                                                                        | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |

Synthetic data: `alpha` generation staged through the test-only harness
(`Fictivol alpha` searched, opened, favorited; calculators run a BMI
70 kg / 175 cm / 30 y = 22.9 kg/m² result with the "Calculation details"
disclosure opened and its contents asserted visible before the audit, so the
Tab and 320 px checks include the disclosed state). The unknown-route
fallback is not in the synthetic server's route map; it stays covered by
`tests/browser/shell.spec.ts` on the dev server.

Touch-target minimums on `webkit-phone` (smallest primary target per route;
all >= 44x44; inline prose links measured and reported without failing):

| Route       | Primary targets | Smallest       |
| ----------- | --------------- | -------------- |
| home        | 11              | nav link 65x44 |
| search      | 10              | nav link 65x44 |
| detail      | 11              | nav link 65x44 |
| favorites   | 10              | nav link 65x44 |
| calculators | 20              | nav link 65x44 |
| status      | 13              | nav link 65x44 |

## Fixes made (all minimal, no clinical wording changed)

1. `tests/browser/production-server.ts`: serve `index.html` for
   `/calculators`. The helper predates the calculators route and returned 404
   for it. Test-only change.
2. `apps/web/src/presentation/styles.css`:
   - `.calculator-meta p { overflow-wrap: anywhere; }` — the formula version
     string (`formula=1.0.0|population=2.1.0|...`) has no spaces and pushed
     `scrollWidth` to 654 at 320 px. Wording unchanged.
   - `.brand { display: inline-flex; min-height: 44px; align-items: center; }`
     — the header brand measured 42.2 px tall on the phone project.
   - `input:focus-visible, summary:focus-visible` outline (same 3 px token as
     the existing rule) — calculator radios and the calculation-details
     summary had no visible focus indicator under `getComputedStyle`.
3. `tabIndex={0}` on links that lacked it (the shell in `App.tsx` already
   carries it on every link): favorites entry + empty-state links, detail
   back link + both dataset-status links + source-document anchor, the two
   search status links, and the calculators primary-reference anchor. Without
   it, WebKit sequential Tab navigation skips those links (verified:
   script-focusable and 44 px tall, but never Tab-reached); Chromium reaches
   them either way. No visual or wording change.
4. `tests/browser/accessibility-audit.spec.ts` (new): the audit itself, plus
   a mid-course correction to its shell-readiness wait (exact-text match; the
   install copy on `/status` quotes the same phrase).

Each fix was verified to address a check that genuinely failed before it
(horizontal scroll 654 px, brand 42.2 px, skipped links, missing indicator),
not added speculatively.

## Review follow-up (PR #48)

Three Greptile findings on `tests/browser/accessibility-audit.spec.ts` were
valid and are addressed in the test only; none exposed an application defect,
so no UI code changed:

1. Calculators: the "Calculation details" disclosure is now opened, checked
   for content (visible `Unrounded value` and exactly four `dd` definition
   values), and left open before `auditRoute`. The Tab traversal and the
   320 px overflow and clipped-text checks therefore audit the disclosed
   state claimed above.
2. Focus indicator: computed outline and box-shadow are snapshotted before
   Tab traversal and compared with the focused state. A pass now requires an
   outline that appears or changes (non-zero width, non-transparent colour)
   or a box-shadow that differs from the unfocused value and is not fully
   transparent. An always-present or transparent shadow no longer passes.
3. Clipped text at 320 px: for text-bearing elements whose computed
   `overflow-x` is `hidden` or `clip`, `scrollWidth > clientWidth + 1` fails.
   Scrollable (`auto`/`scroll`) containers are allowed, as are form controls
   that scroll their own values. The skip link, `.sr-only` equivalents,
   clip-path-only elements and 1x1 screen-reader-only boxes are excluded as
   intentionally hidden.

The clipped-text check was exercised against synthetic markup before the run:
an 80 px `overflow: hidden; white-space: nowrap` box with longer text is
reported (`scrollWidth 209 > clientWidth 80`), while an `overflow-x: auto`
box, the 1x1 clip-path label and the translated skip link are not.

## Commands and pass counts

Follow-up verification used Node 24.21.0 and npm 11.19.0 from `.tools`, with
`INTERMED_NODE22_RUNTIME` pointing at the Node 22.23.2 executable:

- `npm ci`
- `npm run format:check && npm run lint && npm run typecheck && npm run build`
- `npx playwright test tests/browser/accessibility-audit.spec.ts --repeat-each=2` — **36 passed** (6 tests x 3 projects x 2 repeats)
- `npx vitest run tests/repository-path-hygiene.test.ts` — 3 passed (path hygiene still clean)

The initial audit run before this follow-up passed the same spec with
`--repeat-each=3` (54 passed). The matrix wording above describes the
strengthened checks, not the earlier version.

## Manual checks that still need a human

- Screen readers: VoiceOver (Safari macOS/iOS), Narrator (Windows/Edge),
  TalkBack (Android/Chrome) walkthrough of search -> detail -> favorites and
  the calculators result announcement (`aria-live` regions).
- Real iPhone/iPad (Safari, installed PWA): safe-area insets, 44 px targets
  by touch, Add-to-Home-Screen flow on `/status`.
- Browser zoom to 200% and `prefers-reduced-motion` with OS-level reduced
  motion on a real device.
- Keyboard-only pass with a physical keyboard on Safari (Option+Tab link
  behavior) and Firefox (not in the Playwright projects).
