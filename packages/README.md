# Package boundaries

Only packages needed by the development web/PWA shell exist today:

| Package/layer                       | Public boundary                                | Responsibility                                                                           |
| ----------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `@intermed/domain`                  | `src/index.ts`, exposed through `exports["."]` | Dependency-free bootstrap types and injected provider contract; no clinical entities yet |
| `@intermed/data-access`             | `src/index.ts`, exposed through `exports["."]` | Original synthetic bootstrap provider; no network or persistence                         |
| `apps/web/src/application`          | `createServices`                               | Compose injected contracts with validated configuration                                  |
| `apps/web/src/application/shell.ts` | `ShellController`, `ShellState`                | Inject shell status and explicit update/install actions without exposing browser types   |
| `apps/web/src/infrastructure`       | `createBrowserShell`                           | Browser-native service-worker and installation adapter; no clinical persistence          |
| `apps/web/src/presentation`         | `App`                                          | Accessible navigation and explicit development limitations                               |
| `apps/web/src/Bootstrap.tsx`        | Composition root                               | Select mock infrastructure and handle invalid startup configuration                      |

`apps/web/pwa` contains Node-only production build tooling and the explicit public-shell worker generator; it is not imported into domain or presentation. The application controller is injected through bootstrap and consumed with `useSyncExternalStore`. Synthetic persistence canaries are browser tests only.

Imports between workspaces use only their public package names. Dependencies point inward: data-access depends on domain; domain depends on nothing. The AST boundary checker rejects outward/domain imports, browser/network identifiers and private workspace imports. Domain also has an independent TypeScript compilation with no DOM library or ambient framework types. The check is a bootstrap guard, not a claim of complete static security analysis; extend its negative fixtures as new adapters/layers appear.

The proposed medication, interactions, clinical-calculators, ui and test-fixtures packages remain documented extension points. Create them when their milestone needs an actual public contract; do not populate empty packages with medication models, clinical fixtures or placeholder implementations now. Presentation remains in the app until shared UI is needed. Appwrite Functions/configuration begin in Milestone 3 with separate authority.

No React, Appwrite, Dexie, browser persistence, vendor transport object or clinical rule enters domain. Shared DTO validation will accompany real external boundaries; Zod currently validates public app configuration only.
