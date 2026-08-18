import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';

const KIOSK_STATE = 'e2e/.auth/kiosk.json';

/**
 * Spáruje tablet raz pre celú sadu. Párovanie je zámerne obmedzené na
 * 10 pokusov / 15 min per IP, takže párovať v každom teste by si limit
 * vyčerpalo samo a testy by začali padať na vlastnú ochranu.
 */
setup('spáruje tablet párovacím kódom zo seedu', async ({ page }) => {
  await page.goto('/kiosk');

  await expect(page.getByRole('heading', { name: 'Spárovanie kiosku' })).toBeVisible();
  await page.getByPlaceholder('ABC123').fill('E2ETEST');
  await page.getByRole('button', { name: 'Spárovať' }).click();

  // Po spárovaní sa kiosk prekreslí na výber pracovníka.
  await expect(page.getByRole('heading', { name: 'Kto meria?' })).toBeVisible();

  // Adresár je v .gitignore, takže v CI ešte neexistuje.
  mkdirSync(dirname(KIOSK_STATE), { recursive: true });
  await page.context().storageState({ path: KIOSK_STATE });
});
