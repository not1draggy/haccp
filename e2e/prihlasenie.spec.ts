import { test, expect } from '@playwright/test';

/**
 * Vstup do kiosku. Beží bez uloženej cookie — overuje stav, v ktorom tablet
 * ešte nie je prihlásený. Nesprávnych pokusov je zámerne málo: prihlásenie
 * má limit 10 / 15 min per IP a testy si ho nesmú vyčerpať samy.
 */
test('kiosk sa neotvorí sám, pýta kód prevádzky a PIN', async ({ page }) => {
  await page.goto('/kiosk');

  await expect(page.getByRole('heading', { name: 'Prihlásenie do prevádzky' })).toBeVisible();
  // Bez prihlásenia sa k žiadnej prevádzke ani k menám nedá dostať.
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeHidden();
  await expect(page.getByText('Bistro')).toHaveCount(0);
});

test('správny kód so zlým PIN-om neprejde', async ({ page }) => {
  await page.goto('/kiosk');

  await page.getByLabel('Kód prevádzky').fill('E2ETEST');
  await page.getByLabel('PIN', { exact: true }).fill('0000');
  await page.getByRole('button', { name: 'Prihlásiť' }).click();

  // Nie getByRole('alert') — tú rolu nesie aj prázdny oznamovač trasy,
  // ktorý si do stránky vkladá Next.js.
  await expect(page.getByText('Nesprávny kód prevádzky alebo PIN.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeHidden();
});

test('neznámy kód dostane rovnakú hlášku ako zlý PIN', async ({ page }) => {
  await page.goto('/kiosk');

  await page.getByLabel('Kód prevádzky').fill('NEEXIST');
  await page.getByLabel('PIN', { exact: true }).fill('9876');
  await page.getByRole('button', { name: 'Prihlásiť' }).click();

  // Hláška nesmie prezradiť, či taká prevádzka existuje — inak by sa dal
  // zoznam prevádzok zistiť hádaním kódov.
  // Nie getByRole('alert') — tú rolu nesie aj prázdny oznamovač trasy,
  // ktorý si do stránky vkladá Next.js.
  await expect(page.getByText('Nesprávny kód prevádzky alebo PIN.')).toBeVisible();
});

test('tablet bez nastaveného PIN-u sa neprihlási na samotný kód', async ({ page }) => {
  await page.goto('/kiosk');

  await page.getByLabel('Kód prevádzky').fill('NOPIN1');
  await page.getByLabel('PIN', { exact: true }).fill('9876');
  await page.getByRole('button', { name: 'Prihlásiť' }).click();

  // Nie getByRole('alert') — tú rolu nesie aj prázdny oznamovač trasy,
  // ktorý si do stránky vkladá Next.js.
  await expect(page.getByText('Nesprávny kód prevádzky alebo PIN.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeHidden();
});

test('bez kódu alebo bez PIN-u sa nedá odoslať', async ({ page }) => {
  await page.goto('/kiosk');

  await page.getByLabel('Kód prevádzky').fill('E2ETEST');
  await expect(page.getByRole('button', { name: 'Prihlásiť' })).toBeDisabled();

  await page.getByLabel('PIN', { exact: true }).fill('98');
  await expect(page.getByRole('button', { name: 'Prihlásiť' })).toBeDisabled();
});
