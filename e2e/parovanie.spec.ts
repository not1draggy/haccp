import { test, expect } from '@playwright/test';

/**
 * Beží bez uloženej cookie — overuje stav, v ktorom tablet ešte nie je
 * spárovaný. Zlý kód je zámerne len pár pokusov: párovanie má limit
 * 10 / 15 min per IP a testy si ho nesmú vyčerpať samy.
 */
test('nespárovaný tablet pýta párovací kód', async ({ page }) => {
  await page.goto('/kiosk');

  await expect(page.getByRole('heading', { name: 'Spárovanie kiosku' })).toBeVisible();
  // Bez platného kódu sa k menám pracovníkov nedá dostať.
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeHidden();
});

test('neznámy kód tablet nespáruje', async ({ page }) => {
  await page.goto('/kiosk');

  await page.getByPlaceholder('ABC123').fill('ZLYKOD');
  await page.getByRole('button', { name: 'Spárovať' }).click();

  await expect(page.getByText('Neznámy párovací kód.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeHidden();
});

test('príliš krátky kód sa nedá odoslať', async ({ page }) => {
  await page.goto('/kiosk');

  await page.getByPlaceholder('ABC123').fill('AB');
  await expect(page.getByRole('button', { name: 'Spárovať' })).toBeDisabled();
});
