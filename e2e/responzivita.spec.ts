import { test, expect } from '@playwright/test';

/**
 * Vedúci pozerá administráciu z mobilu. Vodorovné rolovanie je najčastejší
 * spôsob, ako sa to pokazí — tabuľka alebo tlačidlo pretlačí stránku do šírky
 * a používateľ musí posúvať do strán, aby vôbec videl obsah.
 */
const STRANKY = ['/', '/login', '/registracia', '/kiosk'];

for (const cesta of STRANKY) {
  test(`${cesta} sa na mobile nerolujte do strán`, async ({ page }) => {
    await page.goto(cesta);

    const pretecenie = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pretecenie, `stránka ${cesta} preteká do šírky`).toBeLessThanOrEqual(1);
  });
}

test('hlavné tlačidlá majú na mobile použiteľnú veľkosť', async ({ page }) => {
  await page.goto('/');

  for (const nazov of [/Kiosk/, /Prihlásenie/]) {
    const box = await page.getByRole('link', { name: nazov }).boundingBox();
    // 44 px je bežné minimum pre dotykový cieľ.
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
