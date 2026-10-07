# Development and reproducible checks

This is Milestone 2 of [the sequential build plan](../plan/CODEX_BUILD_PLAN.md): a development/nonclinical PWA shell. The production build supports public-shell caching, offline launch after successful caching, installation guidance and user-controlled shell updates. It has no medication data, search/checker, medication persistence, accounts or backend. First-party code and original temporary icon artwork remain Apache-2.0. No proprietary source or patient data is needed. [Milestone 1 evidence](MILESTONE_1_EVIDENCE.md) remains a historical snapshot; [Milestone 2 evidence](MILESTONE_2_EVIDENCE.md) records current scope and acceptance gaps.

## Requirements and installation

Use **Node 24.21.0 with its bundled npm 11.19.0** on Windows x64 or CI Linux. `.node-version`, `.nvmrc`, package engines and `packageManager` pin the runtime. Engine checks reject another runtime. One root `package-lock.json` locks all workspaces; do not create a lockfile under apps/packages. Use the official [Node release downloads](https://nodejs.org/en/download/archive/v24.21.0) or your existing version manager. Restart the terminal after selecting the pinned runtime; `npm.cmd` is equivalent if local PowerShell script execution policy prevents `npm`.

From the repository root in PowerShell:

```powershell
node --version # v24.21.0
npm --version  # 11.19.0
npm ci --no-fund
npx playwright install --with-deps chromium webkit
npm run check
```

The same commands run on both GitHub Actions operating systems. Linux browser installation also installs OS libraries; on Windows it downloads browsers. Internet is required to install packages/browser binaries. The application makes only same-origin public-shell requests, with no external/backend requests. Actions runs on every `pull_request` event without a target-branch/path filter, and main pushes. It uses a read-only token, pinned action SHAs, no saved checkout credentials, no production secrets and no `pull_request_target` execution.

Run `npm run dev` for the local Vite server. Run `npm run build`, then `npm run preview` for a local preview of `apps/web/dist`; neither command deploys anything. To override a port, call the workspace directly: `npm run preview --workspace @intermed/web -- --port 4173 --strictPort`. A future hosting adapter must configure SPA fallback for `/status`; local preview deep-link verification does not prove a deployed host's routing.

## Public configuration and mock mode

No environment file is required. The only supported runtime mode is `VITE_RUNTIME_MODE=mock`; an optional placeholder is in [apps/web/.env.example](../apps/web/.env.example). Optional nonsecret reader identifiers (`VITE_PUBLISHED_DATASETS_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`, `VITE_APPWRITE_PUBLISHED_BUCKET_ID`) may be set together and are validated but unused while mock mode is the only mode. No account, anonymous Auth session or cloud key exists in this milestone. Additional `VITE_*` keys, other mode values, partial reader identifiers and credential-shaped values fail startup/build validation without printing values. All frontend variables are public: never put secrets in them. `.env`/local variants remain ignored.

Bootstrap validates configuration with Zod, injects a synthetic `BootstrapInfoProvider`, and renders an accessible error when runtime configuration is invalid. The provider supplies only a development label and unavailable-reference status. It supplies no fabricated medications, interactions or clinical facts. Tests substitute it through the domain contract without credentials. See [package boundaries](../packages/README.md).

## Exact quality commands

| Command                       | Evidence produced                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm ci --no-fund`            | Lockfile-only reproducible workspace installation                                                 |
| `npm run format:check`        | Prettier formatting of application/tooling/current contributor docs                               |
| `npm run lint`                | ESLint, React hooks/refresh and JSX accessibility rules; zero warnings allowed                    |
| `npm run typecheck`           | Strict app/tests/tooling types plus DOM-free domain compilation                                   |
| `npm run test`                | Vitest unit/component and negative boundary fixtures                                              |
| `npm run check:boundaries`    | Actual-source AST checks plus dependency-free domain manifest                                     |
| `npm audit --audit-level=low` | Dependency vulnerability gate                                                                     |
| `npm run build`               | Vite production assets in `apps/web/dist`                                                         |
| `npm run scan:dist`           | Required post-build credential scan of `apps/web/dist`; fails when the build output is missing    |
| `npm run test:browser`        | Playwright production shell, offline/cache/failure/update lifecycle, keyboard focus and viewports |
| `npm run check`               | All quality gates above in order, excluding install/browser download                              |

Use `npm run format` to format supported files. The historical planning corpus and all-branch reviewer configurations are preserved verbatim and excluded from mechanical formatting; this does not exclude them from review or static analysis. No lint/test/analyzer rule is disabled to pass the milestone. Vitest uses threads: the initial Windows fork-pool run completed after a slow 43-second startup; threads completed the same component assertions promptly. Neither startup latency nor the corrected initial Playwright preview-command error counts as a red behavior test.

### Appwrite configuration commands (Milestone 3)

The offline Appwrite permission and secret suites run inside `npm run test`. To run only those, plus the injected reader tests:

```powershell
npx vitest run tests/appwrite-config-permissions.test.ts tests/appwrite-config-secrets.test.ts
npx vitest run packages/data-access
```

No Appwrite CLI invocation is part of any repository script. Provisioning, deployment and rollback commands live in [the Appwrite runbook](APPWRITE_RUNBOOK.md) and remain **NOT YET EXECUTED — requires maintainer approval**.

Milestone 5 importer work is synthetic-only. As of 2026-10-07 the importer core,
the Appwrite store client, and the Function artifact builder are verified
offline (tests and logs only), while the Function handler and final integration
remain pending; no M5 live action was authorized or executed. Do not add source
credentials, real source material, network retrieval, or generated Function
artifacts to the repository. The acceptance/evidence matrix, the recorded root
test counts, and the separate approval sequence are in
[MILESTONE_5_EVIDENCE.md](MILESTONE_5_EVIDENCE.md) and
[APPWRITE_RUNBOOK.md](APPWRITE_RUNBOOK.md); the bounded copied logs and their
copy/redaction policy are in
[docs/evidence/milestone-5-synthetic-2026-10-07/](evidence/milestone-5-synthetic-2026-10-07/README.md).
The implementation workers' focused offline suite is `npx vitest run
tests/importer` in the implementation worktree; integrated gate runs stay with
the lead.

The built bundle is scanned twice. `npm run test` scans `apps/web/dist` whenever that build output already exists, and `npm run scan:dist` (`scripts/scan-dist-secrets.mjs`) scans it unconditionally as the `npm run check` step directly after `npm run build`, failing when the build output is missing instead of skipping. Both use the detector in `tests/support/secret-scan.ts` and report file names and pattern labels only, never matched values.

## Dependencies and API decisions

Exact direct versions are authoritative in root/web manifests and the lockfile. Node LTS/npm were confirmed from the official release index. React/Vite/Router/Vitest contracts were checked with Context7 and official documentation on 2026-10-01. Router uses its declarative `BrowserRouter`/`Routes` API. Milestone 2 selects a build-only Vite plugin and browser-native service worker, with no additional dependency; see the tooling decision below. TanStack Query, Dexie and React Hook Form are deferred until remote metadata, storage and forms are implemented; Tailwind is unnecessary for this shell.

TypeScript 5.9.3 stays within typescript-eslint's `<6.1` peer range. ESLint 9.39.5 satisfies jsx-a11y's current supported peer range; npm reports that ESLint major as unsupported. That maintenance limitation is recorded, not hidden with an override. Reassess the accessible lint stack before future dependency upgrades. The initial full dependency audit reported zero vulnerabilities; that is time-specific evidence, not a future guarantee.

Official references: [React](https://react.dev/learn), [Vite](https://vite.dev/guide/), [React Router](https://reactrouter.com/start/declarative/installation), [Zod](https://zod.dev/basics), [Vitest](https://vitest.dev/guide/), [Testing Library](https://testing-library.com/docs/react-testing-library/setup/), [Playwright](https://playwright.dev/docs/test-configuration), [ESLint](https://eslint.org/docs/latest/use/configure/configuration-files). See [Milestone 1 evidence](MILESTONE_1_EVIDENCE.md) for actual results and limits.

The JavaScript/TypeScript analyzer is requested in `.deepsource.toml` without rule/category suppressions. Only generated output/dependency directories are excluded. DeepSource's [configuration guide](https://docs.deepsource.com/docs/platform/getting-started/configure-analyzers) requires TOML on the default branch before activation. Milestone 1 added it to main; actual latest-head analyzer reports still need inspection and configuration alone does not prove an analysis completed. Dashboard settings are not changed. A passing secrets check does not prove JavaScript analysis or an AI review completed.

## Production PWA shell

The build-only native-worker plugin is selected deliberately for the small explicit public shell, without a new package. It hashes final Vite output, validates a bounded manifest/icon/JS/CSS allowlist and emits `/sw.js` with root scope. `INTERMED_SHELL_REVISION` is an optional nonsecret build label (letters/digits/dot/hyphen, at most 64 characters); release identity also includes asset hashes and worker policy. Clinical dataset/schema versions remain independent and unimplemented.

That public label is emitted in HTML metadata and compiled into startup code's root data attribute. It lets diagnostics/tests verify HTML/code coherence and makes A/B/C production fixture scripts genuinely distinct. It is public provenance, not runtime cloud configuration or a clinical dataset version.

Development on port 5173 registers no worker and shows caching disabled. Production preview normally uses port 4173. Use separate origins for development and preview: an already installed worker can still control its existing origin. Development does not silently unregister workers or clear storage.

Only `/` and `/status` have cached navigation fallback. A first-ever offline visitor without a worker cannot load the app; the browser shows its own offline error and no rendered fallback is promised (amended R67, 2026-10-06). Storage denial, failed downloads and eviction are reported honestly once the page can load. Updates require an explicit finish-work/activation action and refuse with multiple open in-scope windows. Complete current/prior public shells are retained; IndexedDB, preferences and unrelated caches are untouched. See [Milestone 2 evidence](MILESTONE_2_EVIDENCE.md) for exact cache rules, recovery and tests.

For optional local TLS smoke, run `node scripts/check-local-https.mjs` after `npm run build`. It needs OpenSSL (`INTERMED_OPENSSL` can supply its path) and creates ignored temporary certificate/key files in `artifacts/local-https/`. It changes no trust store. Test-only certificate bypass is explicit; this is not trusted hosted/installable validation. Production browser tests build real A/B/C release fixtures into ignored `artifacts/` and use a test-only controlled origin, never an application admin endpoint.

## Browser and device limits

Playwright projects exercise Chromium desktop and WebKit phone/tablet viewports. WebKit automation is not real Safari/iPhone/iPad validation. Milestone 2 adds actual production-worker/offline/update evidence and local self-signed HTTPS smoke. Milestone 2 is accepted for development (maintainer decision, 2026-10-06); the remaining real-device, iPad/Android, screen-reader and response-header checks are milestone 12 pre-release gates. No clinical validation is claimed. The Windows WebKit offline emulator returned an internal error; the suite instead disconnects the real test origin in every engine and additionally uses Chromium's network-offline emulation. It proves cached launch/reload/deep links with no static-shell origin requests; a browser SW-script update check can still attempt network. See the dated evidence for exact coverage.

## Manual device and hosted-origin acceptance

This checklist is for an operator running the app on a real target device. Record observed results; do not substitute Playwright/WebKit emulation, localhost, a self-signed certificate, or a browser certificate bypass. Use only an already-approved HTTPS origin that serves the intended build. No such origin was supplied on 2026-10-06, so the device-install and hosted-origin checks in the current evidence remain blocked. Do not deploy, create a host, or change any trust store as part of this checklist.

**Later hosting authorization, 2026-10-06:** the owner authorized an isolated Appwrite Sites deployment of the development shell only. The approved test origin is now [intermed-shell-test.appwrite.network](https://intermed-shell-test.appwrite.network/), with [development status](https://intermed-shell-test.appwrite.network/status). It serves commit `1a8f09fe351510d3bb796f9e09cfe18d00d2fe48`, public revision equal to that SHA, and shell/worker identity `c1c54c74e5cd17fe68b4`. Later documentation commits do not change this deployed artifact. The earlier unavailable-origin observation above is historical; the new hosted checks and remaining device/header/update gates are recorded in [Milestone 2 evidence](MILESTONE_2_EVIDENCE.md#authorized-appwrite-sites-test-deployment---2026-10-06). No backend feature, paid-plan change or further deployment is authorized by the manual checklist.

### Record device, browser and build identity

**Owner-run iPhone snapshot, 2026-10-06:** [the dated screenshots and limits](MILESTONE_2_EVIDENCE.md#owner-run-iphone-offline-and-reconnection-snapshot---2026-10-06) now record owner-confirmed offline close/reopen from the Home Screen icon, visible shell identity and reconnection feedback. They do not substitute for the remaining install-flow capture, direct deep-link/reload, exact-version, accessibility or two-build update checks below.

**Later owner-reported details, 2026-10-06:** [the follow-up record](MILESTONE_2_EVIDENCE.md#owner-reported-device-details-and-windows-follow-up---2026-10-06) adds iOS `27.0.1` / build `24A446` and Windows installation, offline close/reopen from the taskbar and reconnection feedback. The Windows result is owner-confirmed text, not an agent-observed UI test or screenshot. Running Windows/browser versions and the remaining manual checks still need evidence.

**Subsequent authorized update exercise, 2026-10-06:** the same isolated origin now serves source/public revision `166f0d6dc2bdbdc25200246d4f7a184f71de175d`, shell `a508cce57d69382da112`, deployment `6ac4c927da19bfea3fbf`. The original deployment remains retained. [The update evidence](MILESTONE_2_EVIDENCE.md#hosted-two-build-update-failure-and-restoration---2026-10-06) records instrumented Chromium/WebKit update, multitab, synthetic storage and failed-candidate results separately from the owner's iPhone/Windows activation and post-update offline restart confirmations. A deliberately corrupted candidate was briefly hosted and then replaced by the retained healthy build B; do not activate deployment `6ac4cc59ae6794798ac7`. Appwrite's **Ready** status describes hosting, not successful worker installation. Historical build-A references above remain dated snapshots. The CSP/header policy, exact native browser/Windows versions and remaining device checks are still open. No backend or paid-plan change occurred.

**CSP build E, 2026-10-06:** the same origin now serves source/public revision `0e019544bde5d6691e468c4c3bf885cd90dffb1a`, shell `77c816387c81001988b3`, deployment `6ac4e58c6e620fd5dd84`. Production builds carry a restrictive `Content-Security-Policy` **meta** element; `npm run dev` does not. A meta policy cannot provide header-only directives such as `frame-ancestors`, and the host currently sends no CSP, `Referrer-Policy` or `Permissions-Policy` response header. Healthy builds A and B stay retained as rollback targets; never activate invalid build C. [The CSP/E evidence](MILESTONE_2_EVIDENCE.md#csp-build-e-hosted-lifecycle-and-offline-restart---2026-10-06) separates instrumented results from owner-reported device information. For any E device record, capture `/status` showing the origin and `Shell version: 77c816387c81001988b3`, plus the date/time, tab or installed mode and routes covered. Exact OS/browser versions are optional for these Milestone 2 development records (owner waiver, 2026-10-06; see the evidence record). The earlier A→B owner confirmations do not cover E.

Before testing, record the date/time and timezone, model, exact OS version and build, browser version, and whether the app is in a tab or installed standalone. Record only version fields; do not capture serial numbers or device identifiers. **Scope of the 2026-10-06 owner waiver:** for Milestone 2 development-stage records, exact OS/browser versions are optional and may be written as **owner-waived**. The pre-public release device/browser matrix (roadmap hardening) still requires actual versions, and the waiver does not cover it.

- **iPhone/iPad:** open Settings > General > About > iOS Version or iPadOS Version. Record the complete version and build shown after opening that row. Safari does not expose a separate app-version page in Settings. In a normal Safari tab, a temporary bookmarklet can display the full user-agent string locally: create a bookmark, edit its URL to `javascript:prompt('Copy full Safari user agent',navigator.userAgent)`, open the app origin in Safari, then run the bookmark. Record the complete string and its `Version/...` field if present; the `AppleWebKit/...` token is an engine identifier, not the Safari version. The bookmarklet reads the current page only and sends nothing. If iOS blocks it and no Safari Web Inspector is available, mark the Safari version unverified instead of inferring it.
- **Windows:** open Settings > System > About and record Edition, Version, OS build (including the revision after the dot), and system type. Open Start and run `winver` as a cross-check. In Chrome, open `chrome://version` or menu > Help > About Google Chrome; in Edge, open `edge://version` or menu > Help and feedback > About Microsoft Edge. Record the full version shown by the browser itself, not file metadata alone.
- **Android, if a device becomes available:** record Android version/build from Settings > About phone (and Software information, where present) and Chrome's version from the browser About screen or `chrome://version`.

For every result, obtain the full application commit from the build/deployment record. On the served page, record the public `meta[name="intermed-shell-revision"]` value and the `Shell version: <20-character release identity>` shown on `/status`. They are separate identifiers: the shell identity is not a Git commit or clinical dataset version. If the metadata is missing or says `development`, mark the served commit unconfirmed.

On a desktop browser with DevTools, use this read-only Console probe to record the scope and both shell/worker identities. It asks the active controller for the worker's `SHELL_STATUS` response:

```js
const registration = await navigator.serviceWorker.getRegistration();
const worker = navigator.serviceWorker.controller;
if (!worker) throw new Error('No controlling service worker for this page');
const workerStatus = await new Promise((resolve, reject) => {
  const channel = new MessageChannel();
  const timeout = setTimeout(
    () => reject(new Error('SHELL_STATUS timed out')),
    2000,
  );
  channel.port1.onmessage = ({ data }) => {
    clearTimeout(timeout);
    channel.port1.close();
    resolve(data);
  };
  worker.postMessage({ type: 'SHELL_STATUS' }, [channel.port2]);
});
console.log({
  publicRevision:
    document.querySelector('meta[name="intermed-shell-revision"]')?.content ??
    null,
  scope: registration?.scope ?? null,
  activeScriptURL: registration?.active?.scriptURL ?? null,
  ...workerStatus,
});
```

`version` is the selected shell being served; `workerVersion` is the active worker's own version; `fallback` identifies prior-shell service. Record all returned fields. Safari's installed app has no built-in DevTools console. Use Safari Web Inspector only if an already-available Mac can inspect the device; otherwise record the visible `/status` identity and mark the worker identity unobserved. Never infer it from the current `/sw.js` response when a worker may be serving a retained shell.

### Preconditions and trusted-host inspection

1. Use an owner-approved HTTPS URL that already serves the exact build. In the native browser, confirm the hostname is correct and the certificate is accepted without a warning. Record what the browser displays. Stop if it shows a certificate interstitial or the certificate is not trusted; do not bypass it.
2. Confirm direct online navigation to `/` and `/status` returns the app shell. Record redirects and status codes. Record the `Content-Type`, `Cache-Control`, and relevant security headers for `/`, `/status`, `/manifest.webmanifest`, `/sw.js`, and a hashed asset; compare the exact values with the deployment's reviewed header policy rather than assuming a value.
3. In DevTools, record that the worker script is `/sw.js` and its registration scope is the origin root (`https://<host>/`). Confirm `/status` deep-link routing is served by the actual host. Record the manifest and worker response status, MIME type, redirects, and cache headers.
4. Keep a normal browser profile and a separate test profile/device for first-visit and storage tests. Use synthetic canaries only. Do not use an account, medication data, patient data, or a primary profile whose site storage could be disturbed.

### Installation and cached offline launch

1. **iPhone/iPad Safari:** while online at the approved origin, use Share > Add to Home Screen. If **Open as Web App** is offered, record whether it was enabled, then tap Add. Launch only by tapping the new Home Screen icon. Record whether the app actually opens standalone without Safari browser chrome; an icon or manifest alone is not installation proof.
2. **Chrome/Edge desktop:** observe whether the app's **Install development app** button is offered. If it is absent, inspect that browser's own address-bar/menu installation option and record the exact path and outcome. Install only when the browser offers it, then launch from the installed-app entry and record standalone mode. Do not treat a synthetic prompt or an ordinary tab as installed mode.
3. **Android Chrome, when available:** observe the app's install button, then Chrome's menu option (for example, **Install app** or **Add to Home screen**) if no button appears. Record the exact capability/menu path and wording, install only when offered, and launch from the new app icon to confirm standalone mode. Keep this row open until an actual Android device is tested.
4. **Any additional target browser:** use its install button only when the browser exposes that capability, otherwise inspect its native install menu. Record the exact option and result; if no install option exists, record that and test tab behavior separately. Do not infer installability from the manifest.
5. While online in the installed app, visit `/` and `/status`. Wait for **Shell available offline** and the release identity to appear. Capture the visible shell identity and the statement that the medication dataset and medication features remain unavailable online and offline. Do not continue to an offline test until successful caching is reported.
6. With the device owner's normal network controls, disconnect networking. Force-close the installed app, relaunch it from its icon/app entry, and record the exact screen and shell identity. Navigate to **Development status** in the app and confirm `/status` works offline. Reload there only if the installed browser exposes a reload action; otherwise record reload as unavailable and report close/reopen separately. Record any previous-shell notice or failure text verbatim.
7. Restore networking. In a clean profile/device with no prior visit to this origin, turn networking off before the first navigation. Record the browser's actual result. Expected behavior is that no InterMED shell appears without a worker/cache; do not claim a fallback page unless one was observed. Do not clear the primary profile or an existing installation to simulate this case.
8. Repeat the installed online/offline steps with portrait and landscape orientation. On iPhone/iPad inspect the real notch, corners and Home indicator safe areas, touch targets, text wrapping and scrolling. Capture the install prompt/icon, standalone shell, offline `/status`, and any update/error state where the platform permits. Record screenshots from the actual installed app, not an emulated viewport.

### User-controlled updates, failure, windows and storage

These checks require an already-authorized test origin that can serve two distinct production builds on the same HTTPS origin. Use the host owner's normal release controls; this checklist does not authorize a deployment or any production fault injection.

1. Cache and install build A, and record its commit, public revision, displayed shell identity and worker identity. Use a synthetic-only browser profile. In the page's DevTools Console, seed synthetic canaries before the update:

   ```js
   localStorage.setItem('intermed-manual-preference-canary', 'preserve');
   const database = await new Promise((resolve, reject) => {
     const request = indexedDB.open('intermed-manual-canary', 1);
     request.onupgradeneeded = () => request.result.createObjectStore('canary');
     request.onsuccess = () => resolve(request.result);
     request.onerror = () => reject(request.error);
   });
   await new Promise((resolve, reject) => {
     const transaction = database.transaction('canary', 'readwrite');
     transaction.objectStore('canary').put('preserve', 'sentinel');
     transaction.oncomplete = resolve;
     transaction.onerror = () => reject(transaction.error);
   });
   database.close();
   const unrelatedCache = await caches.open('intermed-manual-cache-canary');
   await unrelatedCache.put(
     new URL('/__intermed-manual-canary__', location.origin).href,
     new Response('preserve', { headers: { 'Content-Type': 'text/plain' } }),
   );
   ```

   Record the preference key/value, database/store/sentinel and cache name/entry/body in DevTools Application/Storage before update. These are disposable synthetic values, not app features or medication data.

2. Have the authorized test origin serve a distinct production build B. From A, request a shell update and wait for the app's update control. On desktop, open a second InterMED app window/tab and attempt the explicit update. Record whether the app refuses while another in-scope window remains open and whether it avoids reloading that window. Close the other window, choose **Update shell and reload**, and record B's commit/revision, shell identity and worker identity. On mobile, record the actual window/tab controls the platform exposes; if it cannot open multiple installed windows, mark that subtest unavailable.
3. On the authorized test origin only, make a controlled update failure (for example, a failed worker or required-asset response) while A is usable. Record the response/status, accessible error announcement, active shell identity and whether A still launches and reloads offline. Never cause a failure on a production host.
4. After A-to-B and after the failure case, verify the synthetic preference, IndexedDB record and unrelated cache entry are unchanged. In DevTools Application/Storage, inspect actual Cache Storage names and Request URLs. Confirm owned caches contain only the public shell manifest, root document, approved icons, and hashed JavaScript/CSS assets; inspect bodies and `Content-Type`, not only names. Any other cached URL/body, cross-origin response, account/clinical/API payload or authentication content is outside this shell's allowlist and must be recorded as a failure for investigation. Record Service Worker responses as such in the Network panel; server logs alone do not prove that an intercepted response was absent. For origin response headers, use a separate online diagnostic request with service-worker bypass only if available; turn bypass back off before installed/offline checks.
5. If storage denial can be tested without changing device security settings, use only the disposable test profile and record the actual browser behavior. A private/incognito context may be recorded as its own mode where the target browser permits the test; do not assume it matches ordinary installed storage. Do not clear browser data to simulate eviction. OS/browser eviction is nondeterministic; mark it **not exercised** unless the platform actually evicts data and the result can be observed safely.

### Input, focus and accessibility

- On desktop, traverse overview, status and update controls with Tab, Shift+Tab and Enter. Check visible focus, skip link, route-change focus, and that update/readiness/failure announcements are exposed to the accessibility tree. Record keyboard-only results.
- On iPhone, use VoiceOver and touch navigation; on Windows, use Narrator if available. Record whether update and unavailable-feature announcements are understandable. Use an external keyboard on mobile only if one is already available; otherwise mark mobile keyboard testing unavailable.
- Record actual touch targets, zoom/text sizing, orientation, safe areas, focus behavior and any clipping. Capture screenshots that show the real device/app mode and reference them in the evidence record. Synthetic Playwright screenshots belong in a separate evidence row and never substitute for these captures.

### Manual result record

Create one record per device/browser/scenario. Include every field below; write **not observed** where instrumentation is unavailable.

```text
Date/time and timezone:
Application commit (full SHA) and source of that identity:
Served public revision meta:
Displayed Shell version:
SHELL_STATUS version / workerVersion / fallback / ready / storageAccessible:
Worker script URL and registration scope:
Device model, OS version/build, browser/version:
Tab or installed standalone mode:
Exact HTTPS origin; certificate trusted in the native browser (yes/no/unknown):
Preconditions and synthetic profile:
Steps performed:
Expected result:
Observed result (include exact error text):
Screenshot/evidence filenames and what each shows:
Limitations or unobserved fields:
```

## Direct version inventory

| Dependency                    | Exact chosen version |
| ----------------------------- | -------------------- |
| `@intermed/data-access`       | `0.0.0`              |
| `@intermed/domain`            | `0.0.0`              |
| `react`                       | `19.3.0`             |
| `react-dom`                   | `19.3.0`             |
| `react-router`                | `7.18.4`             |
| `zod`                         | `4.6.5`              |
| `@eslint/js`                  | `9.39.5`             |
| `@playwright/test`            | `1.63.0`             |
| `@testing-library/dom`        | `10.4.2`             |
| `@testing-library/jest-dom`   | `7.0.1`              |
| `@testing-library/react`      | `16.3.3`             |
| `@testing-library/user-event` | `14.6.7`             |
| `@types/node`                 | `24.19.0`            |
| `@types/react`                | `19.3.0`             |
| `@types/react-dom`            | `19.3.0`             |
| `@vitejs/plugin-react`        | `6.1.1`              |
| `eslint`                      | `9.39.5`             |
| `eslint-plugin-jsx-a11y`      | `6.10.2`             |
| `eslint-plugin-react-hooks`   | `7.1.1`              |
| `eslint-plugin-react-refresh` | `0.5.7`              |
| `globals`                     | `17.13.0`            |
| `jsdom`                       | `30.1.1`             |
| `prettier`                    | `3.9.9`              |
| `typescript`                  | `5.9.3`              |
| `typescript-eslint`           | `8.71.0`             |
| `vite`                        | `8.3.2`              |
| `vitest`                      | `4.1.11`             |
