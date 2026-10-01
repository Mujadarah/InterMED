// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);
const services = {
  info: {
    label: 'Synthetic contributor mode',
    referenceData: 'unavailable' as const,
  },
};

it('labels the shell as development and keeps clinical capabilities unavailable', () => {
  render(
    <MemoryRouter>
      <App services={services} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Development · Not for clinical use')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'A foundation for InterMED' }),
  ).toBeVisible();
  expect(screen.getByText('Synthetic contributor mode')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('navigates to limitations using an accessible link', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <App services={services} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('link', { name: 'Development status' }));
  expect(
    screen.getByRole('heading', { name: 'Development status' }),
  ).toBeVisible();
  expect(screen.getByRole('main')).toHaveFocus();
  expect(
    screen.getByText(
      /Medication lookup and interaction checking are unavailable/,
    ),
  ).toBeVisible();
});

it('offers a recovery link for an unknown route', () => {
  render(
    <MemoryRouter initialEntries={['/unknown']}>
      <App services={services} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { name: 'Page unavailable' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Return to overview' }),
  ).toHaveAttribute('href', '/');
});
