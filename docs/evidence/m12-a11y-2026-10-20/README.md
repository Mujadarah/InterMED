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

| Check                                                                                           | home `/`             | search `/search` | detail `/medication/:id`      | favorites `/favorites`        | calculators `/calculators`                         | status `/status` |
| ----------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ----------------------------- | ----------------------------- | -------------------------------------------------- | ---------------- |
| Exactly one `main`, single `h1` (aria snapshot pins role+name+level), no skipped heading levels | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| Every form control has an accessible name; every button has a name; images have alt text        | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| Skip link works, focus lands on main                                                            | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| Tab reaches every control in DOM order, visible focus indicator, no trap                        | pass x3              | pass x3          | fixed x3 (phone+tablet links) | fixed x3 (phone+tablet links) | fixed x3 (phone focus ring; all projects overflow) | pass x3          |
| No horizontal scroll at 320x640, no clipped text                                                | pass x3              | pass x3          | pass x3                       | pass x3                       | fixed x3 (formula version wrap)                    | pass x3          |
| Touch targets >= 44x44 on phone (primary fail, inline report-only)                              | fixed (brand 42.2px) | pass             | pass                          | pass                          | pass                                               | pass             |
| `prefers-reduced-motion: reduce` disables transitions/animations (none exist)                   | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |
| `lang` present on `<html>`                                                                      | pass x3              | pass x3          | pass x3                       | pass x3                       | pass x3                                            | pass x3          |

Synthetic data: `alpha` generation staged through the test-only harness
(`Fictivol alpha` searched, opened, favorited; calculators run a BMI
70 kg / 175 cm / 30 y = 22.9 kg/m² result with details disclosed). The
unknown-route fallback is not in the synthetic server's route map; it stays
covered by `tests/browser/shell.spec.ts` on the dev server.

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

## Commands and pass counts

Node from `.tools` (`node-v24.21.0-win-x64`, npm 11.19.0):

- `npm ci`
- `npm run format:check && npm run lint && npm run typecheck && npx vitest run && npm run check:boundaries && npm run build`
- `npx playwright test tests/browser/accessibility-audit.spec.ts --repeat-each=3` — **54 passed** (6 tests x 3 projects x 3 repeats)
- `npx playwright test` — full browser suite (see report below)

Known local-only failure per the brief: `tests/importer/artifact.test.ts`
"builds under the OS temp directory" (to be confirmed in the verification
run and left untouched).

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
