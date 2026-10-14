import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { DatasetStateSource } from '@intermed/domain';
import {
  buildDiagnosticsReport,
  diagnosticsText,
  type DiagnosticsStorage,
} from '../application/diagnostics';
import {
  diagnosticFormulas,
  diagnosticPendingApprovals,
} from '../application/diagnostic-formulas';
import type { ShellController } from '../application/shell';
import { readBrowserStorageDiagnostics } from '../infrastructure/browser-diagnostics';

const timestamp = () => new Date().toISOString();
const unknownStorage: DiagnosticsStorage = {
  usageBytes: null,
  quotaBytes: null,
  persisted: null,
};
const clipboardFallback =
  'Clipboard unavailable. Select and copy the diagnostics text below, or download the JSON.';

/** Local, user-controlled exports of an allowlisted operational snapshot. */
export function DiagnosticsSection({
  dataset,
  shell,
  schemaVersion,
  runtimeMode,
  shellRevision = import.meta.env['INTERMED_SHELL_REVISION'] ?? 'development',
  generatedAt = timestamp,
}: {
  readonly dataset: DatasetStateSource;
  readonly shell: ShellController;
  readonly schemaVersion: number | null;
  readonly runtimeMode: string;
  readonly shellRevision?: string;
  readonly generatedAt?: () => string;
}) {
  const datasetState = useSyncExternalStore(
    dataset.subscribe,
    dataset.getState,
  );
  const shellState = useSyncExternalStore(shell.subscribe, shell.getSnapshot);
  const [storage, setStorage] = useState(unknownStorage);
  const [status, setStatus] = useState('');
  useEffect(() => {
    let current = true;
    void readBrowserStorageDiagnostics().then((result) => {
      if (current) setStorage(result);
    });
    return () => {
      current = false;
    };
  }, []);
  const report = useMemo(
    () =>
      buildDiagnosticsReport({
        datasetState,
        shellState,
        storage,
        schemaVersion,
        runtimeMode,
        shellRevision,
        generatedAt: generatedAt(),
        userAgent: navigator.userAgent,
        formulas: diagnosticFormulas,
        pendingApprovals: diagnosticPendingApprovals,
      }),
    [
      datasetState,
      shellState,
      storage,
      schemaVersion,
      runtimeMode,
      shellRevision,
      generatedAt,
    ],
  );
  const text = diagnosticsText(report);

  async function copy() {
    setStatus('');
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') {
        setStatus(clipboardFallback);
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus('Diagnostics copied.');
    } catch {
      setStatus(clipboardFallback);
    }
  }

  function download() {
    setStatus('');
    try {
      const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        'intermed-diagnostics-' + report.generatedAt.slice(0, 10) + '.json';
      anchor.hidden = true;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setStatus('Diagnostics downloaded.');
    } catch {
      setStatus(
        'Diagnostics could not be downloaded. Select and copy the diagnostics text below.',
      );
    }
  }

  return (
    <section
      className="diagnostics-section"
      aria-labelledby="diagnostics-title"
    >
      <h2 id="diagnostics-title">Diagnostics</h2>
      <p>
        Versions and browser storage information only. No favorites, recent
        searches, medication names or entered values. Nothing is uploaded; share
        this report only if you choose to. Formula review status is reported as
        recorded and does not grant clinical approval.
      </p>
      <div className="preferences-actions">
        <button type="button" onClick={() => void copy()}>
          Copy diagnostics
        </button>
        <button type="button" onClick={download}>
          Download diagnostics JSON
        </button>
      </div>
      <p role="status" aria-live="polite">
        {status}
      </p>
      <pre className="diagnostics-report" aria-label="Diagnostics report">
        {text}
      </pre>
    </section>
  );
}
