/**
 * Connection lifecycle handling for an old tab.
 *
 * When another tab or a newer application version wants to change the
 * database, this connection must not block the upgrade and must never discard
 * data. It closes its connection and surfaces `reload-required` so the user can
 * reload at a safe moment. Both Dexie's `versionchange` (this connection is
 * being upgraded over) and `blocked` (this connection is blocking an upgrade)
 * take the same path.
 */

/** Structural subset of a Dexie connection used by the store. */
export interface ConnectionLifecycle {
  on(eventName: 'versionchange' | 'blocked', handler: () => void): void;
  close(): void;
}

/** Close `connection` and report `reloadRequired` on versionchange or blocked. */
export function attachConnectionLifecycle(
  connection: ConnectionLifecycle,
  reloadRequired: () => void,
): void {
  const stop = () => {
    connection.close();
    reloadRequired();
  };
  connection.on('versionchange', stop);
  connection.on('blocked', stop);
}
