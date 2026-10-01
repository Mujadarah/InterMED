# Development and reproducible checks

This is Milestone 1 of [the sequential build plan](../plan/CODEX_BUILD_PLAN.md): a development/nonclinical web shell. It has no medication data, search/checker, offline/installation support, storage, accounts or backend. First-party code remains Apache-2.0. No proprietary source or patient data is needed.

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

The same commands run on both GitHub Actions operating systems. Linux browser installation also installs OS libraries; on Windows it downloads browsers. Internet is required to install packages/browser binaries. The application itself makes no remote requests. Actions runs on every `pull_request` event without a target-branch/path filter, and main pushes. It uses a read-only token, pinned action SHAs, no saved checkout credentials, no production secrets and no `pull_request_target` execution.

Run `npm run dev` for the local Vite server. Run `npm run build`, then `npm run preview` for a local preview of `apps/web/dist`; neither command deploys anything. To override a port, call the workspace directly: `npm run preview --workspace @intermed/web -- --port 4173 --strictPort`. A future hosting adapter must configure SPA fallback for `/status`; local preview deep-link verification does not prove a deployed host's routing.

## Public configuration and mock mode

No environment file is required. The only supported public value is `VITE_RUNTIME_MODE=mock`; an optional placeholder is in [apps/web/.env.example](../apps/web/.env.example). No endpoint, project ID, account, anonymous Auth session or cloud key exists in this milestone. Additional `VITE_*` keys and other mode values fail startup/build validation without printing values. All frontend variables are public: never put secrets in them. `.env`/local variants remain ignored.

Bootstrap validates configuration with Zod, injects a synthetic `BootstrapInfoProvider`, and renders an accessible error when runtime configuration is invalid. The provider supplies only a development label and unavailable-reference status. It supplies no fabricated medications, interactions or clinical facts. Tests substitute it through the domain contract without credentials. See [package boundaries](../packages/README.md).

## Exact quality commands

| Command                       | Evidence produced                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm ci --no-fund`            | Lockfile-only reproducible workspace installation                                               |
| `npm run format:check`        | Prettier formatting of application/tooling/current contributor docs                             |
| `npm run lint`                | ESLint, React hooks/refresh and JSX accessibility rules; zero warnings allowed                  |
| `npm run typecheck`           | Strict app/tests/tooling types plus DOM-free domain compilation                                 |
| `npm run test`                | Vitest unit/component and negative boundary fixtures                                            |
| `npm run check:boundaries`    | Actual-source AST checks plus dependency-free domain manifest                                   |
| `npm audit --audit-level=low` | Dependency vulnerability gate                                                                   |
| `npm run build`               | Vite production assets in `apps/web/dist`                                                       |
| `npm run test:browser`        | Playwright production-preview launch, routes/reload/recovery, keyboard focus and viewport smoke |
| `npm run check`               | All quality gates above in order, excluding install/browser download                            |

Use `npm run format` to format supported files. The historical planning corpus and all-branch reviewer configurations are preserved verbatim and excluded from mechanical formatting; this does not exclude them from review or static analysis. No lint/test/analyzer rule is disabled to pass the milestone. Vitest uses threads: the initial Windows fork-pool run completed after a slow 43-second startup; threads completed the same component assertions promptly. Neither startup latency nor the corrected initial Playwright preview-command error counts as a red behavior test.

## Dependencies and API decisions

Exact direct versions are authoritative in root/web manifests and the lockfile. Node LTS/npm were confirmed from the official release index. React/Vite/Router/Vitest contracts were checked with Context7 and official documentation on 2026-10-01. Router uses its declarative `BrowserRouter`/`Routes` API. No PWA plugin is selected. TanStack Query, Dexie and React Hook Form are deferred until remote metadata, storage and forms are implemented; Tailwind is unnecessary for this shell.

TypeScript 5.9.3 stays within typescript-eslint's `<6.1` peer range. ESLint 9.39.5 satisfies jsx-a11y's current supported peer range; npm reports that ESLint major as unsupported. That maintenance limitation is recorded, not hidden with an override. Reassess the accessible lint stack before future dependency upgrades. The initial full dependency audit reported zero vulnerabilities; that is time-specific evidence, not a future guarantee.

Official references: [React](https://react.dev/learn), [Vite](https://vite.dev/guide/), [React Router](https://reactrouter.com/start/declarative/installation), [Zod](https://zod.dev/basics), [Vitest](https://vitest.dev/guide/), [Testing Library](https://testing-library.com/docs/react-testing-library/setup/), [Playwright](https://playwright.dev/docs/test-configuration), [ESLint](https://eslint.org/docs/latest/use/configure/configuration-files). See [Milestone 1 evidence](MILESTONE_1_EVIDENCE.md) for actual results and limits.

The JavaScript/TypeScript analyzer is requested in `.deepsource.toml` without rule/category suppressions. Only generated output/dependency directories are excluded. DeepSource's [current configuration guide](https://docs.deepsource.com/docs/platform/getting-started/configure-analyzers) requires TOML on the default branch before activation; this PR cannot establish that condition without a later authorized merge. Dashboard settings are not changed. A passing secrets check does not prove JavaScript analysis or an AI review completed.

## Browser and device limits

Playwright projects exercise Chromium desktop and WebKit phone/tablet viewports. WebKit automation is not real Safari/iPhone/iPad validation. No real-device, installed-mode, HTTPS hosting, service-worker, offline or clinical validation is claimed. Milestone 2 must decide manifest/service-worker tooling and compatibility, then record offline/update/install evidence and real-device gaps. Do not begin it as part of this bootstrap.

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
