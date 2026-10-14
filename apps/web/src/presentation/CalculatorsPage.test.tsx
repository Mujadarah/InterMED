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
  expect(screen.getByText('Review status: CLINICALLY REVIEWED')).toBeVisible();
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
    'Classified as Normal range from the unrounded value 24.96 kg/m² (WHO international adult classification, WHO Technical Report Series 894 (2000)). The displayed value 25.0 kg/m² would fall in Pre-obese (overweight); the classification uses the unrounded value.',
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

it('keeps an entered height in its unit when switching calculators', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText('Weight'), '70');
  await user.type(screen.getByLabelText('Height'), '1.75');
  await user.type(screen.getByLabelText('Age in years'), '30');
  expect(screen.getByLabelText('Height unit')).toHaveValue('m');
  await user.click(
    screen.getByRole('radio', {
      name: 'Body surface area, Mosteller (adult estimate)',
    }),
  );

  // 1.75 stays metres; it is not reinterpreted as 1.75 cm.
  expect(screen.getByLabelText('Height')).toHaveValue('1.75');
  expect(screen.getByLabelText('Height unit')).toHaveValue('m');
  await user.click(screen.getByRole('button', { name: 'Calculate' }));
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

  expect(screen.getByText('Review status: CLINICALLY REVIEWED')).toBeVisible();

  await useCentimetres(user);
  await calculate(user, { weight: '70', height: '175', age: '17' });

  expect(
    screen.getByText(/Outside this release's scope/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Review status: CLINICALLY REVIEWED')).toBeVisible();
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

async function selectCalculator(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole('radio', { name }));
}

async function fillRenalInputs(
  user: ReturnType<typeof userEvent.setup>,
  values: { creatinine: string; age: string },
) {
  await user.clear(screen.getByLabelText('Serum creatinine'));
  await user.type(screen.getByLabelText('Serum creatinine'), values.creatinine);
  await user.clear(screen.getByLabelText('Age in years'));
  await user.type(screen.getByLabelText('Age in years'), values.age);
}

it('calculates CKD-EPI eGFR for female and male without pre-selecting sex', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'eGFR, CKD-EPI 2021 creatinine (adult, unreviewed)',
  );

  expect(screen.getByRole('radio', { name: 'Female' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Male' })).not.toBeChecked();

  await fillRenalInputs(user, { creatinine: '1', age: '60' });
  await user.click(screen.getByRole('radio', { name: 'Female' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(screen.getByText('eGFR')).toBeVisible();
  expect(screen.getByText('Result: 64 mL/min/1.73 m²')).toBeVisible();

  await user.click(screen.getByRole('radio', { name: 'Male' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(screen.getByText('Result: 86 mL/min/1.73 m²')).toBeVisible();
});

it('matches milligram and micromole creatinine results for CKD-EPI', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'eGFR, CKD-EPI 2021 creatinine (adult, unreviewed)',
  );
  await user.selectOptions(screen.getByLabelText('Creatinine unit'), 'µmol/L');
  await fillRenalInputs(user, { creatinine: '88.4', age: '60' });
  await user.click(screen.getByRole('radio', { name: 'Female' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(screen.getByText('Result: 64 mL/min/1.73 m²')).toBeVisible();
});

it('calculates Cockcroft-Gault clearance for male and female', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );
  expect(
    screen.getByRole('radio', { name: 'Actual body weight' }),
  ).not.toBeChecked();
  expect(
    screen.getByRole('radio', { name: 'Ideal body weight' }),
  ).not.toBeChecked();
  expect(
    screen.getByRole('radio', { name: 'Adjusted body weight' }),
  ).not.toBeChecked();

  await user.clear(screen.getByLabelText('Body weight entered (kg or lb)'));
  await user.type(
    screen.getByLabelText('Body weight entered (kg or lb)'),
    '72',
  );
  await fillRenalInputs(user, { creatinine: '1', age: '60' });
  await user.click(screen.getByRole('radio', { name: 'Actual body weight' }));
  await user.click(screen.getByRole('radio', { name: 'Male' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(screen.getByText('Creatinine clearance (unindexed)')).toBeVisible();
  expect(
    screen.getByText('Result: 80 mL/min — weight entered: Actual body weight'),
  ).toBeVisible();
  expect(
    screen.queryByText(
      /has not calculated or validated the ideal or adjusted/,
      {
        exact: false,
      },
    ),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: 'Female' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(
    screen.getByText('Result: 68 mL/min — weight entered: Actual body weight'),
  ).toBeVisible();
});

it('shows the not-validated note for ideal and adjusted conventions', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );
  await user.clear(screen.getByLabelText('Body weight entered (kg or lb)'));
  await user.type(
    screen.getByLabelText('Body weight entered (kg or lb)'),
    '72',
  );
  await fillRenalInputs(user, { creatinine: '1', age: '60' });
  await user.click(screen.getByRole('radio', { name: 'Male' }));

  await user.click(screen.getByRole('radio', { name: 'Ideal body weight' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));
  expect(
    screen.getByText('Result: 80 mL/min — weight entered: Ideal body weight'),
  ).toBeVisible();
  expect(
    screen.getByText(/has not calculated or validated the ideal or adjusted/, {
      exact: false,
    }),
  ).toBeVisible();

  await user.click(screen.getByRole('radio', { name: 'Adjusted body weight' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));
  expect(
    screen.getByText(
      'Result: 80 mL/min — weight entered: Adjusted body weight',
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/has not calculated or validated the ideal or adjusted/, {
      exact: false,
    }),
  ).toBeVisible();
});

it('requires the weight convention before calculating Cockcroft-Gault', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );
  await user.clear(screen.getByLabelText('Body weight entered (kg or lb)'));
  await user.type(
    screen.getByLabelText('Body weight entered (kg or lb)'),
    '72',
  );
  await fillRenalInputs(user, { creatinine: '1', age: '60' });
  await user.click(screen.getByRole('radio', { name: 'Male' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(
    screen.getByText(/cannot be calculated/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
});

it('clears the weight convention when switching calculators', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );
  await user.click(screen.getByRole('radio', { name: 'Ideal body weight' }));
  expect(
    screen.getByRole('radio', { name: 'Ideal body weight' }),
  ).toBeChecked();

  await selectCalculator(user, 'Body mass index (adult)');
  expect(
    screen.queryByRole('radio', { name: 'Ideal body weight' }),
  ).not.toBeInTheDocument();

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );
  expect(
    screen.getByRole('radio', { name: 'Ideal body weight' }),
  ).not.toBeChecked();
  expect(
    screen.getByRole('radio', { name: 'Actual body weight' }),
  ).not.toBeChecked();
  expect(
    screen.getByRole('radio', { name: 'Adjusted body weight' }),
  ).not.toBeChecked();
});

it('shows the missing-required message when sex is not selected', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'eGFR, CKD-EPI 2021 creatinine (adult, unreviewed)',
  );
  await fillRenalInputs(user, { creatinine: '1', age: '60' });
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  // The engine's missing-required message shows at the field and in the
  // result section, with no number.
  const messages = screen.getAllByText(/A required value was not supplied/, {
    exact: false,
  });
  expect(messages).toHaveLength(2);
  for (const message of messages) expect(message).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
});

it('shows out-of-population for a renal calculator at age 17', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'eGFR, CKD-EPI 2021 creatinine (adult, unreviewed)',
  );
  await fillRenalInputs(user, { creatinine: '1', age: '17' });
  await user.click(screen.getByRole('radio', { name: 'Male' }));
  await user.click(screen.getByRole('button', { name: 'Calculate' }));

  expect(
    screen.getByText(/adults aged 18 years or older/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Result:/, { exact: false }),
  ).not.toBeInTheDocument();
});

it('keeps shared inputs and clears the rest when switching calculators', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText('Weight'), '70');
  await user.type(screen.getByLabelText('Height'), '175');
  await user.selectOptions(screen.getByLabelText('Height unit'), 'cm');
  await user.type(screen.getByLabelText('Age in years'), '60');

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );

  // Weight and age keep their entered values and units; height is gone.
  expect(screen.getByLabelText('Body weight entered (kg or lb)')).toHaveValue(
    '70',
  );
  expect(screen.getByLabelText('Weight unit')).toHaveValue('kg');
  expect(screen.getByLabelText('Age in years')).toHaveValue('60');
  expect(screen.queryByLabelText('Height')).not.toBeInTheDocument();

  await fillRenalInputs(user, { creatinine: '1', age: '60' });
  await user.click(screen.getByRole('radio', { name: 'Female' }));

  await selectCalculator(user, 'Body mass index (adult)');

  // Creatinine and sex do not leak into the BMI calculator.
  expect(screen.queryByLabelText('Serum creatinine')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('radio', { name: 'Female' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Weight')).toHaveValue('70');
  expect(screen.getByLabelText('Age in years')).toHaveValue('60');
});

it('shows the badge and limitations for both renal calculators', async () => {
  const user = userEvent.setup();
  renderPage();

  await selectCalculator(
    user,
    'eGFR, CKD-EPI 2021 creatinine (adult, unreviewed)',
  );
  expect(screen.getByText('Review status: CLINICALLY REVIEWED')).toBeVisible();
  expect(
    screen.getByText(/cystatin C equations are separate/, { exact: false }),
  ).toBeVisible();
  expect(
    screen.getByText(/Technical bounds, not clinically validated/, {
      exact: false,
    }),
  ).toBeVisible();

  await selectCalculator(
    user,
    'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  );
  expect(screen.getByText('Review status: CLINICALLY REVIEWED')).toBeVisible();
  expect(
    screen.getByText(/no drug dosing is provided/i, { exact: false }),
  ).toBeVisible();
  expect(
    screen.getByText(/not intermed's default medication-dosing method/i, {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    screen.getByText(/not interchangeable with CKD-EPI/i, { exact: false }),
  ).toBeVisible();
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
