# CodeRabbit port evidence — 2026-10-07

Cherry-picks of the unique CodeRabbit commits onto `main` at `12630af`, branch
`codex/port-coderabbit-tests-docs`. Both patches applied with no conflicts.
Application and worker behaviour was not changed. Node used for every gate:
v24.21.0.

| Source    | Subject                                                                  | Port commit |
| --------- | ------------------------------------------------------------------------ | ----------- |
| `104b129` | test: cover shell build, worker lifecycle, browser adapter and status UI | `838b290`   |
| `e71442e` | docs: clarify shell controller and component docstrings                  | `7e51ba4`   |

Docstring corrections against current code are `d5f7bbe`. This note is a later
docs commit. Logs are UTF-8, LF, with trailing whitespace stripped. No ported
test failed on current main, so there is no red log: the assertions already
matched the code and were not rewritten to manufacture a failure.

`vitest.config.ts` already includes `apps/**/*.test.{ts,tsx}` and uses the
`node` environment. That picks up `apps/web/pwa/*.test.ts`. The UI tests opt
into jsdom with a file comment. Worker tests supply `self`, `caches`, `clients`
and `crypto` inside `vm`. No config change.

Playwright already exercises the shell end to end. These unit tests stay
because they pin the deterministic matrix those scenarios do not enumerate:
asset caps, MIME essence, metadata rejection, activation order, reload consent
and status copy. None are mock-only tautologies. None were removed or had an
assertion changed.

## Ported tests

### `apps/web/pwa/shell-build.test.ts`

- uses development provenance when no revision is configured — kept: an omitted `INTERMED_SHELL_REVISION` defines `"development"`.
- embeds valid public revision — kept: labels of 1–64 ASCII letters, digits, dots or hyphens are defined and injected as meta content.
- rejects invalid revision — kept: empty, 65 characters, slash, space, markup, newline and non-ASCII throw `Invalid shell revision` before any worker write.
- rejects unsupported deployment base — kept: a base other than `/` throws the root-scope error.
- pins actual output bytes, MIME types and only approved public assets — kept: the release hashes on-disk bytes and lists only index, root-level hashed js/css, the manifest and the four icons.
- keeps release identity independent of bundle enumeration order and sensitive to asset bytes — kept: identity follows sorted asset bytes and worker text, not bundle order.
- refuses a bundle without its entry HTML — kept: missing `index.html` throws `Invalid or oversized public shell` and does not write `sw.js`.
- allows sixteen assets but rejects a seventeenth — kept: the documented cap of 16 assets is the boundary.
- allows exactly two MiB but rejects one additional byte — kept: the documented cap of 2 MiB is the boundary.
- does not emit a worker when a required public file cannot be read — kept: a read failure aborts emission; the message is that read error.

### `apps/web/pwa/worker.test.ts`

- installs only pinned public bytes with credential-free, uncached requests and no automatic activation — kept: install fetches with `no-store`, `omit` and `redirect: error`, then reports ready without `skipWaiting`.
- discards a failed candidate while preserving unrelated storage — kept: corrupt bytes, wrong MIME, HTTP failure, missing MIME and an oversized body drop only the candidate and announce `SHELL_UPDATE_FAILED`.
- deletes partial candidate writes when a later download fails — kept: a later fetch rejection deletes the staged cache.
- accepts supported JavaScript MIME — kept: `text/javascript`, `application/javascript` and a charset parameter remain ready.
- rejects prior-shell metadata — kept: invalid JSON, a non-array, an empty list, a missing index, duplicates, a non-public URL, a bad hash, a wrong type, a null entry and 17 entries are not served.
- rejects modified current-release pins even when metadata and cached bytes agree — kept: the current cache must match the compiled pin list, not only its own header.
- rejects cache metadata naming a different version — kept: `X-Intermed-Shell-Version` must match the cache name.
- revalidates cached bytes on every status request — kept: corrupting index, js or css after a ready status makes the next status not ready.
- selects the most recently activated prior release, ignoring insertion order and waiting candidates — kept: the highest activation order wins, and a cache with no order is not a fallback.
- does not serve a prior release with invalid activation order — kept: missing, 0, negative, fractional and unsafe orders are not activated.
- prefers a usable current release over a later activation order in another cache — kept: a valid current cache wins over an older release with a higher order.
- distinguishes inaccessible storage from missing caches — kept: a storage exception reports `storageAccessible: false` and still returns the worker version.
- does not intercept excluded request — kept: non-public, external, query, non-GET, authorized and non-route navigation requests are not handled.
- serves verified index HTML for offline navigation to `/` and `/status` — kept: those two routes return the verified index and do not hit the network.
- validates the requested static asset and index without reading unrelated cached bodies — kept: a static hit reads the index and that asset only.
- falls back to network without caching an unverified response — kept: corruption, a missing asset or storage denial fetches once and does not `cache.put`.
- refuses activation with multiple in-scope windows — kept: more than one in-scope window posts `SHELL_ACTIVATION_BLOCKED` and does not `skipWaiting`.
- activates only on request and excludes out-of-scope windows from the tab count — kept: one in-scope window plus an external window calls `skipWaiting`.
- reports failed activation — kept: missing bytes or a storage rejection post `SHELL_UPDATE_FAILED` and do not `skipWaiting`.
- native activation retains the designated prior shell and unrelated storage — kept: activation keeps the current cache, its recorded prior, unrelated caches and non-release names, and drops other owned releases.
- native activation after eviction preserves a usable prior release — kept: an incomplete candidate announces failure, deletes nothing and status falls back to the activated prior.
- explicit repair preserves other candidate caches and acknowledges completion without activating — kept: repair posts `SHELL_REPAIRED`, does not delete caches and does not `skipWaiting`.
- reports repair download failure without declaring success — kept: a failed repair posts only `SHELL_REPAIR_FAILED`.

### `apps/web/src/infrastructure/browser-shell.test.ts`

- leaves development mode free of registration and installation prompts — kept: `createBrowserShell(false)` stays `development` and does not register or prompt.
- reports unsupported — kept: an insecure context or missing service workers set `unsupported` and do not register.
- registers at root without cached update scripts and publishes the worker reply — kept: production registers `/sw.js` with `updateViaCache: 'none'` and publishes the status reply.
- can retry a failed registration when no worker controls the page — kept: repair after a rejected register tries registration again.
- does not claim readiness when there is no active or controlling worker — kept: with neither worker, status stays `installing` and no status port is opened.
- times out at three seconds, closes the port, and recovers on focus — kept: the probe deadline is 3000 ms, then focus probes again.
- reports confirmed missing caches without losing the reported version — kept: `ready: false` becomes `unavailable` and keeps the replied version.
- notifies subscribers with a new stable snapshot and honors unsubscription — kept: a patch replaces snapshot identity and an unsubscribed listener is not called.
- preserves waiting after a failed network update check — kept: `registration.update` rejection sets `available` when a worker is waiting, otherwise `failed`, and does not reload.
- preserves waiting while using a prior cached shell — kept: `fallback: true` sets `usingPrior` and `failed` only when nothing is waiting.
- checks again on reconnect and probes availability after a successful check — kept: `online` calls `update` then the status probe.
- waits for explicit activation and the resulting controller change before reloading — kept: `activate` posts `ACTIVATE_SHELL` and reloads only on the later `controllerchange`.
- activation without a waiting worker does not grant reload consent — kept: `activate` is a no-op without `waiting`, so a controller change offers `reload` instead of reloading.
- distinguishes initial control from a subsequent unsolicited controller change — kept: the first controller sets `none`; a later one sets `reload` and does not reload.
- revokes reload consent — kept: activation blocked, update failed, repair failed, `updatefound` and `repair` clear consent, so the following controller change does not reload.
- reports a blocked activation and permits an explicit retry — kept: `SHELL_ACTIVATION_BLOCKED` sets `blocked`, and a later `activate` can still reload.
- reports installation failure with active — kept: `SHELL_UPDATE_FAILED` sets `failed` when an active worker exists, otherwise `unavailable`.
- watches newly discovered workers and advertises installation without autoactivation — kept: `installed` plus a waiting worker sets `available`; `redundant` with an active worker sets `failed`; no activate message is sent.
- ignores unrelated worker messages — kept: unknown and null messages do not replace the snapshot.
- repairs through the controller and preserves waiting — kept: repair clears `repairFailed`, posts `REPAIR_SHELL`, and a repaired shell stays `available` when a worker is waiting, otherwise `reload`.
- consumes the install prompt once, including browser rejection — kept: `beforeinstallprompt` is cancelled, one `install` calls `prompt`, and a thrown prompt still clears `canInstall`.
- discards a deferred prompt after installation elsewhere — kept: `appinstalled` drops the prompt so `install` does not call it.

### `apps/web/src/Bootstrap.test.tsx`

- shows an accessible startup error for invalid configuration without leaking values — unchanged: already on main.
- passes the injected shell through bootstrap and routing at `/` and `/status` — kept: the supplied controller reaches both routes and its update action runs only on click.
- uses the development controller by default for valid configuration — kept: omitted shell shows offline caching disabled and no update button.

### `apps/web/src/presentation/ShellStatus.test.tsx`

- requires an explicit accessible action to activate or reload — unchanged: already on main.
- does not equate cached shell availability with medication availability — unchanged: already on main.
- offers installation only when a browser capability supplies a prompt — unchanged: already on main.
- keeps unavailable storage and development mode explicit — unchanged: already on main.
- explains installing and unsupported without offering an update check or retry — kept: those states render the documented copy and no button.
- checks for updates only after the user requests it — kept: `check` runs from the ready-state button only.
- explains blocked activation and allows an explicit retry — kept: blocked copy is shown, repair is hidden, and the update button calls `activate` rather than `reload`.
- offers reload without activation when a cached shell is already ready — kept: update `reload` calls `reload` and does not call `activate`.
- offers repair for unavailable and for a prior shell — kept: those states call `repair` and not `reload`.
- keeps a waiting update actionable after repair failure — kept: `available` or `blocked` with `repairFailed` keeps the update button and hides repair, matching the Milestone 2 repair-waiting rule.
- reacts to controller notifications and unsubscribes on unmount — kept: `useSyncExternalStore` rerenders on notify and drops the listener on unmount.

## Ported docstrings

- `Bootstrap.tsx` — kept: validation failure still renders the alert, and the default controller is the inert `developmentShell`.
- `application/shell.ts` — kept: each `developmentShell` method matches its empty body (shared development snapshot, no subscription, no check, no cache change, no activation, no reload, no install prompt).
- `infrastructure/browser-shell.ts` header — adjusted: with production disabled, only `reload` and `repair` still touch the browser. `check`, `activate` and `install` do nothing until a registration or install prompt exists. The ported sentence said every explicit action retained its browser effect.
- `infrastructure/browser-shell.ts` `repair` — kept: the method reads `navigator.serviceWorker`, so it requires service workers. Listener throws and `postMessage` throws propagate. Registration rejection stays inside `register` and is not described as propagating.
- `presentation/App.tsx` — adjusted: `App` always renders `ShellStatus` for the supplied controller, including development mode. The ported sentence said that mode omits shell status.

## Gate results

Commands below were run on the docstring commit, before this evidence commit.
`npm run check` exit 0 is `npm-run-check.log`. The other logs are the same
commands run separately immediately before that.

| Log                    | Command                    | Exit                                                                                                                                          |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `format-check.log`     | `npm run format:check`     | 0                                                                                                                                             |
| `lint.log`             | `npm run lint`             | 0                                                                                                                                             |
| `typecheck.log`        | `npm run typecheck`        | 0                                                                                                                                             |
| `test.log`             | `npm run test`             | 0, 21 files, 277 tests                                                                                                                        |
| `check-boundaries.log` | `npm run check:boundaries` | 0, dependency-free domain, 40 source files                                                                                                    |
| `build.log`            | `npm run build`            | 0                                                                                                                                             |
| `npm-run-check.log`    | `npm run check`            | 0. Includes the gates above, `npm audit` (0 vulnerabilities), `scan:dist` (9 files, no credential-shaped strings) and Playwright (135 passed) |

The five ported test files were also run alone before the docstring edit:
129 passed. Comment-only edits do not change that count. The 277 includes those 129.
