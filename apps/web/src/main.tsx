import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Bootstrap } from './Bootstrap';
import './presentation/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Application root is missing');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Bootstrap
        env={{ VITE_RUNTIME_MODE: import.meta.env['VITE_RUNTIME_MODE'] }}
      />
    </BrowserRouter>
  </StrictMode>,
);
