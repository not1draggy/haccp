import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';

const KIOSK_STATE = 'e2e/.auth/kiosk.json';

/**
 * Prihlási tablet raz pre celú sadu. Prihlásenie je zámerne obmedzené na
 * 10 pokusov / 15 min per IP, takže prihlasovať sa v každom teste by si limit
 * vyčerpalo samo a testy by začali padať na vlastnú ochranu.
 */
setup('prihlási tablet do prevádzky kódom a PIN-om', async ({ page }) => {
  await page.goto('/kiosk');

  await expect(page.getByRole('heading', { name: 'Prihlásenie do prevádzky' })).toBeVisible();
  await page.getByLabel('Kód prevádzky').fill('E2ETEST');
  await page.getByLabel('PIN', { exact: true }).fill('9876');
  await page.getByRole('button', { name: 'Prihlásiť' }).click();

  // Po spárovaní sa kiosk prekreslí na výber pracovníka.
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeVisible();

  // Adresár je v .gitignore, takže v CI ešte neexistuje.
  mkdirSync(dirname(KIOSK_STATE), { recursive: true });
  await page.context().storageState({ path: KIOSK_STATE });
});
