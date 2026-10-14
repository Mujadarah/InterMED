# WebKit-phone offline navigation flake — test-server hardening (2026-10-14)

## Observed CI failures (Ubuntu, webkit-phone)

- `tests/browser/pwa.spec.ts:192` "caches only the shell and launches/reloads existing deep links offline". The `freshPage.goto(server.url, { waitUntil: 'domcontentloaded' })` call timed out after 30 s. Seen on e241e93 and on PR #32 (run 38566746129, attempt 1).
- `tests/browser/recovery-update.spec.ts:71`. The `ready()` helper did not see "Shell available offline" within 5 s. Seen on PR #32 (same run, attempt 2).

## Finding

`tests/browser/production-server.ts` simulated an offline origin by destroying a socket only when an HTTP `request` event arrived. Two kinds of TCP connection never fire that event while the origin is "offline":

- idle keep-alive connections opened before the switch;
- connections accepted without a complete request, such as a speculative preconnect.

Node does not close them at once. With Node 24's defaults, an idle keep-alive socket closes after `keepAliveTimeout` (5 s) plus `keepAliveTimeoutBuffer` (1 s). A connection that never completes its request headers lasts until `headersTimeout` (60 s). The 300 s `requestTimeout` applies only to a request that has started but not finished. A browser that reuses or waits on one of them sees a hanging origin rather than an offline one. A real offline origin fails immediately. A temporary diagnostic probe confirmed the server-side behaviour: before the change, a requestless socket and an idle keep-alive socket both stayed open after `failure('offline')`.

## Change

This is a test-only change in `tests/browser/production-server.ts`:

- the server tracks open sockets;
- switching to `offline` destroys every open socket;
- while offline, new connections are destroyed on `connection`.

The per-request destroy is kept as a backstop. No production code, assertion, timeout or retry changed.

## Evidence (WSL Ubuntu, Node 24.21.0, Playwright WebKit)

| Run                                                                                   | Before change           | After change            |
| ------------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| `pwa.spec.ts` + `recovery-update.spec.ts`, webkit-phone, `--repeat-each=30`           | 270/270 passed, 2.1 min | 270/270 passed, 1.5 min |
| Target test only, webkit-phone, `--repeat-each=30`                                    | —                       | 30/30                   |
| `pwa`, `pwa-lifecycle`, `offline-deeplinks`, webkit phone + tablet, `--repeat-each=5` | —                       | 210/210                 |
| Forced worker-update race diagnostic, webkit-phone, `--repeat-each=10`                | —                       | 10/10                   |

Windows, after the change: `pwa`, `recovery-update` and `eviction-recovery` across chromium-desktop, webkit-phone and webkit-tablet with `--repeat-each=3` passed 108/108.

### Automated regression test

`tests/production-server-offline.test.ts` (Vitest, raw TCP sockets) asserts four things:

- an idle keep-alive connection is closed when the server switches offline;
- an accepted connection that never sent a request is closed;
- a new connection made while offline is closed immediately;
- an online keep-alive connection stays open.

Against the previous server, the three offline cases fail (each socket was still open after 1 s) and the online case passes. With the change, all four pass.

**Limitation, stated plainly:** the CI hang was **not reproduced** locally. The old server also passed 270/270 under WSL. The change closes a confirmed gap in the offline simulation, the only one found that can hold a WebKit navigation open, and the faster run is consistent with no stale sockets lingering. It is hardening, not a proven root-cause fix. If the WebKit-phone failures recur on CI after this lands, the next step is to capture a Playwright trace from the CI run itself.

An earlier WSL run showed 70 failures. Those came from a missing Chromium headless-shell install in WSL (`browserType.launch: Executable doesn't exist`), not from this hang, so they are excluded as evidence.
