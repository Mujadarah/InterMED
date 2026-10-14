// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { CalculatorsPage } from './CalculatorsPage';

afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter>
      <CalculatorsPage />
    </MemoryRouter>,
  );
}

async function fillInputs(
  user: ReturnType<typeof userEvent.setup>,
  values: { weight: string; height: string; age: string },
) {
  await user.clear(screen.getByLabelText('Weight'));
  await user.type(screen.getByLabelText('Weight'), values.weight);
  await user.clear(screen.getByLabelText('Height'));
  await user.type(screen.getByLabelText('Height'), values.height);
  await user.clear(screen.getByLabelText('Age in years'));
  await user.type(screen.getByLabelText('Age in years'), values.age);
}

async function calculate(
  user: ReturnType<typeof userEvent.setup>,
  values: { weight: string; height: string; age: string },
) {
  await fillInputs(user, values);
  await user.click(screen.getByRole('button', { name: 'Calculate' }));
}

async function useCentimetres(user: ReturnType<typeof userEvent.setup>) {
  // BMI normalizes height to metres; entering centimetre values like 175
  // needs the cm unit selected first.
  await user.selectOptions(screen.getByLabelText('Height unit'), 'cm');
}

it('calculates a normal BMI and always shows the review badge and limitations', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(
    screen.getByText('Development preview — not for clinical use.'),
  ).toBeVisible();
  expect(screen.getByText('Review status: UNREVIEWED')).toBeVisible();
  expect(screen.getByText('Limitations')).toBeVisible();
  expect(
    screen.getByText(/Technical bounds, not clinically validated/, {
      exact: false,
    }),
  ).toBeVisible();

  await useCentimetres(user);
  await calculate(user, { weight: '70', height: '175', age: '30' });

  expect(screen.getByText('Result: 22.9 kg/m²')).toBeVisible();
  expect(screen.getByText(/Normal range/, { exact: false })).toBeVisible();
});

it('shows the boundary note when the display crosses a WHO cutoff', async () => {
  const user = userEvent.setup();
  renderPage();

  await useCentimetres(user);
  await calculate(user, { weight: '99.84', height: '200', age: '30' });

  expect(screen.getByText('Result: 25.0 kg/m²')).toBeVisible();
  expect(
    screen.getByText(/Classification:.*Normal range/, { exact: false }),
  ).toBeVisible();
  const note = screen.getByText(
    'WHO international adult classification, WHO Technical Report Series 894 (2000) uses the unrounded exact value 24.96 kg/m²; the displayed value 25.0 kg/m² would be classified as WHO international adult classification, WHO Technical Report Series 894 (2000): Pre-obese (overweight).',
  );
  expect(note).toBeVisible();
  expect(note.textContent).toContain('Pre-obese (overweight)');
});

it('calculates BSA on the Mosteller calculator', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(
    screen.getByRole('radio', {
      name: 'Body surface area, Mosteller (adult estimate)',
    }),
  );
  await calculate(user, { weight: '70', height: '175', age: '30' });

  expect(screen.getByText('Result: 1.84 m²')).toBeVisible();
});

it('renders BSA to two decimal places for a whole-number result', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(
    screen.getByRole('radio', {
      name: 'Body surface area, Mosteller (adult estimate)',
    }),
  );
  await calculate(user, { weight: '80', height: '180', age: '30' });

  expect(screen.getByText('Result: 2.00 m²')).toBeVisible();
});

it('takes the review badge from the returned result once calculated', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(screen.getByText('Review status: UNREVIEWED')).toBeVisible();

  await useCentimetres(user);
  await calculate(user, { weight: '70', height: '175', age: '17' });

  expect(
    screen.getByText(/Outside this release's scope/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Review status: UNREVIEWED')).toBeVisible();
});

it('normalizes pound and inch inputs before calculating', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.selectOptions(screen.getByLabelText('Weight unit'), 'lb');
  await user.selectOptions(screen.getByLabelText('Height unit'), 'in');
  await calculate(user, {
    weight: String(70 / 0.45359237),
    height: String(175 / 2.54),
    age: '30',
  });

  expect(screen.getByText('Result: 22.9 kg/m²')).toBeVisible();
});

it('requires explicit confirmation before calculating unusual values', async () => {
  const user = userEvent.setup();
  renderPage();

  await useCentimetres(user);
  await calculate(user, { weight: '20', height: '175', age: '30' });

  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/outside the .*30–250 kg check range/, {
      exact: false,
    }),
  ).toBeVisible();
  const confirm = screen.getByRole('button', {
    name: 'I confirm these values',
  });
  await user.click(confirm);

  expect(screen.getByText(/Result:.*kg\/m²/, { exact: false })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'I confirm these values' }),
  ).not.toBeInTheDocument();
});

it('shows out-of-population for age 17 without a number', async () => {
  const user = userEvent.setup();
  renderPage();

  await useCentimetres(user);
  await calculate(user, { weight: '70', height: '175', age: '17' });

  expect(
    screen.getByText(/adults aged 18 years or older/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
});

it('shows engine messages for invalid inputs without a number', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(
    screen.getByText(/cannot be calculated/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
});

it('keeps inputs ephemeral across re-mounts', async () => {
  const user = userEvent.setup();
  const rendered = render(
    <MemoryRouter>
      <CalculatorsPage />
    </MemoryRouter>,
  );

  await fillInputs(user, { weight: '70', height: '175', age: '30' });
  expect(screen.getByLabelText('Weight')).toHaveValue('70');

  rendered.unmount();
  renderPage();

  expect(screen.getByLabelText('Weight')).toHaveValue('');
  expect(screen.getByLabelText('Height')).toHaveValue('');
  expect(screen.getByLabelText('Age in years')).toHaveValue('');
  expect(
    within(
      screen.getByRole('region', { name: 'Calculation result' }),
    ).getByText(/No result yet/, { exact: false }),
  ).toBeInTheDocument();
});
