import { test, expect } from '@playwright/test';

test('úvodná stránka ponúka kiosk aj administráciu', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Digitálny HACCP denník' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Kiosk/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Prihlásenie/ })).toBeVisible();
});

test('neexistujúca stránka ukáže slovenskú 404, nie hlášku Next.js', async ({ page }) => {
  const res = await page.goto('/takato-stranka-neexistuje');

  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Stránka neexistuje' })).toBeVisible();
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
});

test('health endpoint hlási stav databázy', async ({ request }) => {
  const res = await request.get('/api/health');

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.checks).toMatchObject({ app: 'ok', database: 'ok', config: 'ok' });
});

test('prihlásenie odmietne nesprávne údaje a nepustí do administrácie', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel(/e-?mail/i).fill('nikto@example.invalid');
  await page.getByLabel(/heslo/i).fill('zleheslo123');
  await page.getByRole('button', { name: /Prihlásiť/i }).click();

  await expect(page).not.toHaveURL(/\/admin/);
});

test('administrácia je pre neprihláseného nedostupná', async ({ page }) => {
  await page.goto('/admin');

  // Nesmie sa zobraziť obsah administrácie — očakávame presmerovanie na login.
  await expect(page).toHaveURL(/\/login/);
});
