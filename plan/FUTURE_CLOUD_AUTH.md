# ClinPath Future Cloud, Accounts and Authentication

## Current decision

Do **not** build accounts or a hosted backend for MVP.

Reasons:

- no hosting budget required;
- less operational burden;
- lower privacy/security surface;
- faster development;
- app remains useful offline;
- avoids locking architecture to a backend before product fit is known.

## iCloud first

Implement optional iCloud/CloudKit before custom accounts if cross-device Apple sync is needed.

Architecture:

```text
Local database
   ↕
SyncCoordinator
   ↕
CloudKitSyncAdapter
```

Do not make CloudKit types part of domain models.

## Appwrite later

Appwrite is a reasonable candidate because it supports self-hosting and authentication/OAuth. Treat it as **one possible implementation**, not the architecture itself.

Create generic interfaces such as:

```text
AccountService
RemoteCaseStore
RemoteSettingsStore
```

Then implement:

```text
AppwriteAccountAdapter
AppwriteRemoteCaseAdapter
```

This allows replacement by another provider later.

## Future account value proposition

Only ask users to create an account when it gives clear value, such as:

- cross-platform sync beyond iCloud;
- encrypted server backup;
- shared settings;
- multi-device non-Apple use;
- organization-managed clinical content;
- paid/pro features if ever introduced.

Do not require an account merely to open/use the app.

## Sign in with Apple

Future option.

Use Apple's AuthenticationServices framework.

Store your own stable internal user/account ID and link the Apple identity to it.

Do not assume email will always be a normal personal email; users may use Apple's private relay.

## Google Sign-In

Future option.

If Google Sign-In is used to establish/authenticate the user's primary iOS app account, ensure the app also provides an equivalent login option satisfying current App Store Review login-service requirements. Sign in with Apple is the natural option.

Do not implement Google-only login on iOS without reviewing the current App Store requirements at release time.

## Account migration

When accounts are introduced, existing local users must not lose data.

Suggested migration:

1. User installs update.
2. App continues in Local Only mode.
3. User optionally creates/signs into an account.
4. App asks whether to associate/migrate existing local data.
5. Show data destination clearly.
6. Encrypt/upload only after explicit consent.
7. Keep a recoverable local copy until migration succeeds.

## Account deletion

Before public account release implement:

- in-app account deletion initiation;
- remote data deletion policy;
- local-data choice (keep local vs delete local);
- sign-out behavior;
- token revocation;
- provider unlinking.

## Google Drive / OneDrive / Dropbox

Recommended first implementation is **encrypted backup**, not live database sync.

Why:

- much simpler conflict model;
- less risk of record divergence;
- portable;
- user controls destination;
- provider outage does not stop app use.

Backup flow:

```text
Local DB
 ↓
Versioned export bundle
 ↓
Client-side encryption
 ↓
Cloud provider upload
```

Later, if needed, build richer sync as a separate feature with explicit conflict semantics.

## No hospital system integration

Keep this out of current roadmap unless product requirements change.

The domain can remain FHIR-aware to preserve future interoperability, but ClinPath should not require EHR access.

