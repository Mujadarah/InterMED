# Sites preparation evidence

These records are offline preparation checks only. No Appwrite CLI, cloud
endpoint, deployment, credential, or live-site operation was used.

| Record                             | Command                                                                                         | Exit | Meaning                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-host-runtime-engine-check.log` | `npm ci --no-fund`                                                                              |    1 | Local host is Node 25.6.1/npm 11.9.0 and fails the repository's exact Node 24.21.0/npm 11.19.0 engines. This is not an Appwrite image result. |
| `01-red-vitest.log`                | `npx vitest run tests/appwrite-sites-install.test.ts tests/appwrite-config-permissions.test.ts` |    1 | Historical red fixture: development install command did not yet use the pinned wrapper.                                                       |
| `02-green-vitest.log`              | `npx vitest run tests/appwrite-sites-install.test.ts tests/appwrite-config-permissions.test.ts` |    0 | Historical green fixture after the wrapper configuration fix.                                                                                 |
| `03-check.log`                     | `npm run check`                                                                                 |    0 | Historical full offline quality check.                                                                                                        |

An actual Appwrite `node-22` build-image run remains **NOTRUN** and must not be
inferred from the localhost engine failure. Any future authorized deployment
must capture the real build command, observed Node/npm versions, and command
exit statuses from that Appwrite run.
