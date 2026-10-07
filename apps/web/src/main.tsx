import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Bootstrap } from './Bootstrap';
import './presentation/styles.css';
import { createBrowserShell } from './infrastructure/browser-shell';

const container = document.getElementById('root');
if (!container) throw new Error('Application root is missing');
const shell = createBrowserShell(import.meta.env.PROD);
// Public build provenance lets diagnostics verify HTML and bundled code agree.
document.documentElement.dataset['intermedShellRevision'] =
  import.meta.env['INTERMED_SHELL_REVISION'] ?? 'development';

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Bootstrap
        shell={shell}
        env={{
          VITE_RUNTIME_MODE: import.meta.env['VITE_RUNTIME_MODE'],
          VITE_PUBLISHED_DATASETS_ENDPOINT: import.meta.env[
            'VITE_PUBLISHED_DATASETS_ENDPOINT'
          ],
          VITE_APPWRITE_PROJECT_ID: import.meta.env['VITE_APPWRITE_PROJECT_ID'],
          VITE_APPWRITE_PUBLISHED_BUCKET_ID: import.meta.env[
            'VITE_APPWRITE_PUBLISHED_BUCKET_ID'
          ],
        }}
      />
    </BrowserRouter>
  </StrictMode>,
);
