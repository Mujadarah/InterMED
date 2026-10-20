# M12: Function authorization, permission-denial and rate-limit evidence

## Purpose

Record the Milestone 12 function authorization audit for the private
`import-anmdmr` runner: every denial path with its code line and covering
test, the collection/bucket permission assertions, and what bounds repeated
invocation. No live Appwrite calls were made; all behavior is proven by the
tracked configuration as code and the fake-REST Vitest suites.

## Denial matrix (path → code → test)

| Refusal path                                                                                                                       | Code                                                                                                                                                                                                                      | Covering test                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong method (anything but POST)                                                                                                   | `infra/appwrite/functions/import-anmdmr/src/main.js:55` → 405 `method-not-allowed`                                                                                                                                        | `tests/importer/function.test.ts` rejects every non-POST method; zero backend calls                                                                                                                                                                                                                                   |
| Missing or empty trusted server key                                                                                                | `infra/appwrite/functions/import-anmdmr/src/runtime-config.js:37-39` → 401 `runtime-credential-missing` via `main.js:60`                                                                                                  | `tests/importer/function.test.ts` AUTH_MATRIX (missing key, empty key, header key cannot substitute)                                                                                                                                                                                                                  |
| Wrong endpoint, project or function id                                                                                             | `infra/appwrite/functions/import-anmdmr/src/runtime-config.js:41-48` → 403 `runtime-context-rejected`                                                                                                                     | `tests/importer/function.test.ts` AUTH_MATRIX (foreign/missing endpoint incl. decorated FRA variant, foreign/missing project, foreign/missing function id; request headers cannot substitute)                                                                                                                         |
| Malformed or extra-field envelope                                                                                                  | `infra/appwrite/functions/import-anmdmr/src/envelope.js:12,35,46` (`MAX_ENVELOPE_BYTES=2048`, strict `{ operationId }` shape and `op-(stage\|publish)-` pattern) → 400 `envelope-invalid` via `main.js:68`                | `tests/importer/function.test.ts` ENVELOPE_MATRIX (16 smuggled-field/shape cases), retired `body`/`bodyRaw`/header fallbacks, malformed and oversized `bodyText`                                                                                                                                                      |
| Unknown operation intent (no private intent file)                                                                                  | `infra/appwrite/functions/import-anmdmr/src/operations.js:51,66-67,266-268` (`loadIntent` NOT_FOUND → `unknown`) → 404 `operation-unknown`                                                                                | `tests/importer/function.test.ts` unknown private operation; `bodyText` unknown operation                                                                                                                                                                                                                             |
| Missing raw snapshot for a known intent (new)                                                                                      | `infra/appwrite/functions/import-anmdmr/src/operations.js:83` (raw NOT_FOUND in `runStage`) → 404 `operation-unknown`                                                                                                     | `tests/importer/handler-denials.test.ts` missing raw snapshot; asserts 404, bounded code, no POST writes, no empty-table writes, leak-free logs                                                                                                                                                                       |
| Intent file outside the reserved name                                                                                              | `infra/appwrite/functions/import-anmdmr/src/operations.js:56` (`isReservedIntentFileName`) → 403 `operation-rejected`                                                                                                     | `tests/importer/handler-intent.test.ts` reserved-name mismatch; no row/file writes                                                                                                                                                                                                                                    |
| Intent schema or purpose invalid; review or candidate bytes stored at the intent id                                                | `infra/appwrite/functions/import-anmdmr/src/operations.js:66-67` (`parseIntentDocument` / `intentMatchesOperation`) → 403 `operation-rejected`                                                                            | `tests/importer/handler-intent.test.ts` (review at intent id, candidate bytes at intent id) plus parse-level stage/publish tampering matrices                                                                                                                                                                         |
| Intent operation binding mismatch (new)                                                                                            | `infra/appwrite/functions/import-anmdmr/src/operations.js:67` (`intentMatchesOperation` fails: stored `operationId` differs from the envelope reference) → 403 `operation-rejected`                                       | `tests/importer/handler-denials.test.ts` binding mismatch; asserts 403, bounded code, no writes, leak-free logs                                                                                                                                                                                                       |
| Raw hash mismatch                                                                                                                  | `infra/appwrite/functions/import-anmdmr/src/operations.js:89` → 403 `operation-rejected`                                                                                                                                  | `tests/importer/handler-flow.test.ts` raw hash verified before parse/write; state unchanged                                                                                                                                                                                                                           |
| Missing or mismatched review, config binding, baseline binding, stage binding, or large-removal approval without explicit approval | `infra/appwrite/functions/import-anmdmr/src/operations.js:173,175,181` → 403 `operation-rejected`                                                                                                                         | `tests/importer/handler-flow.test.ts` publish tampering matrix (8 cases: missing review, raw/candidate/config/baseline mismatches, large-removal without approval, missing operational approval, different stage binding); state unchanged                                                                            |
| Publication disabled                                                                                                               | `infra/appwrite/functions/import-anmdmr/src/operations.js:264` (trusted flag not exactly `'true'`) → 403 `publication-disabled`, zero backend calls                                                                       | `tests/importer/function.test.ts` flag matrix; `tests/importer/handler-intent.test.ts` disabled publish                                                                                                                                                                                                               |
| Publication lease busy                                                                                                             | `infra/appwrite/functions/import-anmdmr/src/storage-bridge.js:885` (`BridgeError publication-busy`) → `operations.js:228-229` → 409 `publication-busy`                                                                    | `tests/importer/handler-flow.test.ts` concurrent second publication; `tests/importer/handler-bridge.test.ts` lock tests                                                                                                                                                                                               |
| Publication collision                                                                                                              | Core `packages/importer/src/publisher.ts` reason → `operations.js:244-245` → 409 `publication-collision`                                                                                                                  | `tests/importer/handler-flow.test.ts` missing canonical manifest id; core-level divergent-manifest cases in `tests/importer/publication-resume-review.test.ts` and `tests/importer/publisher.test.ts`                                                                                                                 |
| Stale baseline (new at handler level)                                                                                              | Core baseline recheck → `operations.js:247-248` → 409 `stale-baseline`                                                                                                                                                    | `tests/importer/handler-denials.test.ts` two candidates staged against the empty baseline, first published, second refused; asserts 409, bounded code, durable state unchanged, lock released, no public writes, leak-free logs. Core-level resume cases remain in `tests/importer/publication-resume-review.test.ts` |
| Backend / unexpected failure                                                                                                       | `infra/appwrite/functions/import-anmdmr/src/main.js:96-104` (`StoreError` → 500 `backend-error`, anything else → 500 `operation-failed`)                                                                                  | `tests/importer/function.test.ts` sentinel thrown fault and failing backend response; never echoes backend text                                                                                                                                                                                                       |
| Expired, consumed or replayed intent                                                                                               | No expiry and no consumption exist: `issuedAt`/`approvedAt` are validated as instants only, intents stay readable, and retries return the identical `staged` / `already-published` outcome                                | Documented as designed, not denied. Replay idempotency proven by `tests/importer/handler-flow.test.ts` (identical publication on retry, intent read-only across retries) and `tests/importer/handler-artifact-flow.test.ts`                                                                                           |
| Ambiguous write                                                                                                                    | No `ambiguous-write` response code: `storage-bridge.js` maps a lost write response to `AmbiguousWriteError`, the core read-verifies the commit point and still reports `published` (with warnings) or `already-published` | Proven as recovery, not refusal, by `tests/importer/handler-flow.test.ts` (lost descriptor write still commits) and `tests/importer/handler-bridge.test.ts` (409 → conflict, lost response → ambiguity with durable apply)                                                                                            |

Summary: 14 denial/recovery paths were already covered before this change;
3 handler-level gaps were added (raw-missing 404, binding-mismatch 403,
stale-baseline 409). Expired/consumed intents and ambiguous writes are
intentionally not refusals and are documented, not tested as denials.

Every new denial test asserts the HTTP status, the bounded response `code`,
that no durable store write happened (no POST writes for early denials;
durable rows/files unchanged plus lock released and no public writes for the
stale case), and that `safeLog` output matches the content-free pattern with
no request body, operation id, credential or dataset text.

## Permission assertions

Tracked configuration (`infra/appwrite/appwrite.config.development.json`,
`infra/appwrite/appwrite.config.production.json`), checked by
`tests/appwrite-config-permissions.test.ts` (38 tests, both environments):

- Public reads are exactly `read("any")` on `published-datasets`,
  `dataset-bundles` and `dataset-versions`; no other permission exists on any
  resource.
- No create, update, delete or write grant exists for any role, which includes
  the anonymous (`guests`) and member (`users`) roles; an explicit new test
  names those roles on collections and buckets.
- Only the `any` role is used, so no grant needs an Auth session.
- `raw-sources`, `quarantine`, `import-run-logs` and `import-runs` carry empty
  `$permissions`; public resources grant reads at the resource level with
  `rowSecurity`/`fileSecurity` false, and private resources enable no
  per-row/per-file grants.
- The `import-anmdmr` function has `execute: []`, `scopes: []`, `vars: []`,
  is enabled and has no schedule; an explicit new test rejects `any`,
  `guests` and `users` entries in the execute list.

## Rate-limit and abuse findings

What bounds repeated invocation today (all as code, nothing invented):

- Execute permissions: the function `execute` list is empty in both
  environments, so only the project owner can invoke it; an unauthenticated
  execution probe is refused at the platform boundary.
- Intent single-use/consumption: none. Intents are never deleted or marked
  consumed; replay is allowed and idempotent (same `staged` /
  `already-published`, manifest pinned to the immutable approval timestamp).
  There is no per-operation nonce or expiry.
- Publication lease: one global lock (`import-runs` row `lock`) with a fresh
  random owner token per attempt; a held lock fails closed with 409
  `publication-busy`. There is no lease expiry or reclaim in code: a process
  that dies between acquire and release leaves the lock held until an owner
  intervenes.
- Timeouts: function `timeout: 60` seconds in both tracked configurations.
- Payload bounds: request envelope 2048 bytes (`envelope.js`); store
  `maxBytes` 5 MiB per row request, upload and response body
  (`appwrite-store.js`); private/public artifacts 5 MiB
  (`storage-bridge.js`); list queries at most 100 entries of 4096 chars;
  bounded run-evidence and warning projections.
- No per-function rate limit configurable as code was found in the tracked
  configuration or the runner sources. Platform-level abuse protection may
  exist outside this repository, but it is not declared here and is not
  claimed.

Gap recorded as **owner decision pending**: whether to accept owner-only
execute plus idempotent (non-consuming) intents as the abuse mitigation, or
to pursue a platform rate limit / lease-expiry story outside code. No live
settings were changed.

## Owner or live checks still open

- Confirm the owner-only execute posture and the stale-lock recovery runbook
  (who clears a lock row left by a crashed run).
- Decide on intent expiry/single-use versus permanent idempotent replay.
- Decide whether a platform per-function rate limit is wanted; none is
  configurable as code in this repository.
- Live acceptance still needs provisioning approval (Milestone 3 open gate):
  anonymous public-read probes, denied writes, and the execute-denied probe
  against the real project.

## Limitations

- No live Appwrite calls, deployments, or settings changes were made; rate
  and permission claims rest on configuration as code plus fake-REST tests.
- The stale-lock crash window is documented from code reading, not from a
  live kill test.
- New tests use synthetic fixtures and placeholder credentials only.
- One environment-specific failure is known on the authoring machine:
  `tests/importer/artifact.test.ts` "builds under the OS temp directory";
  it does not reflect the tracked assertions.

## Validation

```sh
npm run format:check && npm run lint && npm run typecheck && npx vitest run && npm run check:boundaries
```
