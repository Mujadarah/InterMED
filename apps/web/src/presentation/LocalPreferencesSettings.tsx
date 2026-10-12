import { useRef, useState } from 'react';
import type { PreferencesService } from '../application/preferences';
import { ConfirmationDialog } from './ConfirmationDialog';

type Confirmation = 'clear-recent' | 'clear-all' | null;

/** Local privacy, export and removal controls for browser-stored data. */
export function LocalPreferencesSettings({
  preferences,
}: {
  readonly preferences: PreferencesService;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function downloadPreferences() {
    setError('');
    setStatus('');
    try {
      const exportedAt = new Date().toISOString();
      const data = await preferences.exportPreferences(exportedAt);
      const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
        type: 'application/json',
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `intermed-preferences-${exportedAt.slice(0, 10)}.json`;
      anchor.style.display = 'none';
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      }
      setStatus('Preferences downloaded.');
    } catch {
      setError('Preferences could not be exported from this browser.');
    }
  }

  async function clearRecentSearches() {
    setError('');
    try {
      await preferences.clearRecentSearches();
      setConfirmation(null);
      setStatus('Recent searches cleared.');
    } catch {
      setConfirmation(null);
      setError('Recent searches could not be cleared from this browser.');
    }
  }

  async function clearAllLocalData() {
    setError('');
    setStatus('');
    try {
      const result = await preferences.clearAllLocalData();
      setConfirmation(null);
      if (result.status === 'refused' && result.reason === 'writer-busy') {
        setError(
          'Another tab is updating local data, so this browser’s data was not cleared.',
        );
        return;
      }
      setStatus('Local data cleared from this browser.');
    } catch {
      setConfirmation(null);
      setError('Local data could not be cleared from this browser.');
    }
  }

  return (
    <section
      className="local-preferences-settings"
      aria-labelledby="local-preferences-title"
    >
      <h2 id="local-preferences-title" ref={headingRef} tabIndex={-1}>
        Local preferences
      </h2>
      <p>
        Favorites and recent searches are stored only in this browser and are
        not synced. Private mode, quota limits, clearing site data, or browser
        eviction can remove them.
      </p>
      <div className="preferences-actions">
        <button type="button" onClick={() => void downloadPreferences()}>
          Download preferences
        </button>
        <button
          type="button"
          onClick={() => {
            setError('');
            setStatus('');
            setConfirmation('clear-recent');
          }}
        >
          Clear recent searches
        </button>
        <button
          type="button"
          onClick={() => {
            setError('');
            setStatus('');
            setConfirmation('clear-all');
          }}
        >
          Clear all local data
        </button>
      </div>
      <p className="preferences-status" role="status" aria-live="polite">
        {status}
      </p>
      {error && <p role="alert">{error}</p>}
      {confirmation === 'clear-recent' && (
        <ConfirmationDialog
          title="Clear recent searches?"
          message="This removes recent searches from this browser."
          confirmLabel="Clear searches"
          fallbackFocusRef={headingRef}
          onCancel={() => setConfirmation(null)}
          onConfirm={clearRecentSearches}
        />
      )}
      {confirmation === 'clear-all' && (
        <ConfirmationDialog
          title="Clear all local data?"
          message="This removes the downloaded dataset, favorites, and recent searches from this browser. Another tab updating local data can prevent the clear."
          confirmLabel="Clear all local data"
          fallbackFocusRef={headingRef}
          onCancel={() => setConfirmation(null)}
          onConfirm={clearAllLocalData}
        />
      )}
    </section>
  );
}
