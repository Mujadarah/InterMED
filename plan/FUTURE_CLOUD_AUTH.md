# InterMED cloud, optional accounts and future backup

## Infrastructure now, authentication later

Appwrite Sites, Functions, database services and Storage are initial MVP infrastructure; [APPWRITE.md](APPWRITE.md) defines their boundaries. User accounts remain optional and can be deferred. Anonymous/local-first use means no account and no mandatory anonymous authentication session merely for public datasets.

Local medication search, favorites and recent searches remain useful without identity. Backend hosting and reference updates do not authorize collection of patient data or identity-linked medication-query analytics.

## Later clinician accounts

Introduce AuthenticationProvider behind the application layer in phase 4 only with a defined user benefit: cross-device preferences/favorites, saved drug lists or approved personal notes. Explain which data move from local-only to server-backed storage and require opt-in.

Candidate mechanisms include email/password, passwordless email/magic links, Sign in with Apple and Google Sign-In. Passkeys/WebAuthn require a current provider/capability assessment; this plan does not assert that Appwrite provides a chosen passkey flow. Verify OAuth redirect/platform, session, CSRF/XSS, account-linking and recovery semantics before enabling any mechanism.

Account identity is not patient identity. No patient identifier becomes mandatory. Design account/session revocation, account deletion, export, conflict handling, retention and local-data ownership before public Auth launch. Signing out/deleting an account must describe which local copies remain and let the user remove them.

## Migration and sync

Keep a local-only mode. Migration to an account is explicit, reversible where feasible and tested: select data to upload, resolve duplicates/conflicts, show completion/failure and preserve a usable local copy. Do not silently upload favorites, notes or future patient records after login.

Sync status and last success are visible. Conflicts cannot silently overwrite newer clinical information. Offline queued writes, retries, account switching and permission changes need tests. Appwrite Realtime may be evaluated if it solves a concrete problem; do not make it a prerequisite for reference downloads.

## External backup and portability

Preserve BackupProvider adapters for Google Drive, OneDrive and Dropbox. They are optional future encrypted backup destinations, not primary reference-data sources and not automatically real-time sync engines. Use versioned portable InterMED envelopes, attachments/manifests, integrity validation, resumable transfer, restore previews and provider revocation.

Encryption before data leave the device requires an explicit browser-compatible key-management/recovery threat model. Do not present UI locking or provider-at-rest encryption as equivalent to end-to-end backup encryption. Define what happens when a key is lost, an upload fails, storage is unavailable or data must be deleted. No health-data backup integration before the patient privacy/security review.

## Patient data gate

Before phase 5 and especially before any identifiable patient data reach a backend: approve intended use, legal basis/consent, hosting/processor arrangements, organizational permissions, encryption/key management, retention/deletion/export, audit logging, incident response and operational ownership. EU hosting alone is insufficient.

Minimize identity; generated case ID and optional alias/name/DOB/age/national ID/file/admission/ward/bed fields remain supported. Avoid raw identifiable input to generic AI providers by default; separate review/configuration is required for future cloud AI.

## Future native-client appendix

iCloud/CloudKit remains an optional future native storage/sync adapter, separate from PWA/Appwrite infrastructure. Face ID/Touch ID, Keychain/Secure Enclave and native app-switcher protections require native implementations; browsers cannot be assumed to provide identical semantics. Native Apple/Google sign-in must meet then-current platform distribution requirements. Native policies and tools are not MVP gates.

