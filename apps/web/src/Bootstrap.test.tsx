// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { Bootstrap } from './Bootstrap';

afterEach(cleanup);
it('shows an accessible startup error for invalid configuration without leaking values', () => {
  render(
    <MemoryRouter>
      <Bootstrap env={{ VITE_RUNTIME_MODE: 'synthetic-invalid-value' }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Configuration unavailable',
  );
  expect(screen.getByRole('alert')).not.toHaveTextContent(
    'synthetic-invalid-value',
  );
  expect(screen.getByText('Development · Not for clinical use')).toBeVisible();
});
