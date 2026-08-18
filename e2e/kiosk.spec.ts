import { test, expect, type Page } from '@playwright/test';

const PIN = '4321';
const ZAMESTNANEC = 'Anna Kuchárka';
const CHLADNICKA = 'Chladnička kuchyňa'; // limit 0 až 5 °C

/** Prejde od výberu pracovníka po zoznam zariadení. */
async function prihlasSa(page: Page) {
  await page.goto('/kiosk');
  await page.getByRole('button', { name: new RegExp(ZAMESTNANEC) }).click();
  for (const c of PIN) {
    await page.getByRole('button', { name: c, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Ďalej' }).click();
  await expect(page.getByRole('heading', { name: 'Ktoré zariadenie?' })).toBeVisible();
}

// Klávesy so znakom majú popisný aria-label kvôli čítačkám — selektor preto
// nemôže hľadať samotný znak.
const POPIS_KLAVESY: Record<string, string> = {
  '-': 'Prepnúť znamienko',
  ',': 'Desatinná čiarka',
};

/**
 * Výsledok merania. Nedá sa adresovať cez `getByRole('status')` — tú rolu
 * nesie aj banner s počtom čakajúcich meraní a Next.js si navyše do stránky
 * vkladá vlastný prázdny `role="alert"` oznamovač trasy.
 */
function vysledok(page: Page) {
  return page.locator('button[role="status"]');
}

/** Zadá hodnotu na numerickej klávesnici a uloží. */
async function zadajHodnotu(page: Page, hodnota: string) {
  for (const znak of hodnota) {
    const nazov = POPIS_KLAVESY[znak] ?? znak;
    await page.getByRole('button', { name: nazov, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Uložiť' }).click();
}

test.describe('kiosk — meranie', () => {
  test('celý flow zapíše meranie v limite ako OK', async ({ page }) => {
    await prihlasSa(page);
    await page.getByRole('button', { name: new RegExp(CHLADNICKA) }).click();
    await expect(page.getByRole('heading', { name: CHLADNICKA })).toBeVisible();

    await zadajHodnotu(page, '4');

    const stav = vysledok(page);
    await expect(stav).toContainText('Zapísané — OK');
    await expect(stav).toContainText('4 °C');
  });

  test('hodnota mimo limitu je ALARM, aj keď klient status neposiela', async ({ page }) => {
    await prihlasSa(page);
    await page.getByRole('button', { name: new RegExp(CHLADNICKA) }).click();

    // Chladnička má limit 0–5 °C, 12 °C teda musí byť alarm. Status počíta
    // výhradne server — toto je overenie invariantu, nie len UI.
    await zadajHodnotu(page, '12');

    const stav = vysledok(page);
    await expect(stav).toContainText('ALARM — mimo limitu!');
    await expect(stav).toContainText('Informuj vedúceho');
  });

  test('záporná teplota sa zapíše správne', async ({ page }) => {
    await prihlasSa(page);
    await page.getByRole('button', { name: /Mraznička sklad/ }).click();

    await zadajHodnotu(page, '-20'); // '-' mapuje na tlačidlo ±

    await expect(vysledok(page)).toContainText('Zapísané — OK');
    await expect(vysledok(page)).toContainText('-20 °C');
  });

  test('po uložení sa PIN znovu nepýta', async ({ page }) => {
    await prihlasSa(page);
    await page.getByRole('button', { name: new RegExp(CHLADNICKA) }).click();
    await zadajHodnotu(page, '3');
    await expect(vysledok(page)).toContainText('Zapísané');

    // Klik na výsledok pokračuje na ďalšie zariadenie. PIN prompt uprostred
    // merania je v CLAUDE.md výslovne zakázaný — prerušuje operátora.
    await vysledok(page).click();

    await expect(page.getByRole('heading', { name: 'Ktoré zariadenie?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /— PIN$/ })).toBeHidden();
  });

  test('nesprávny PIN meranie nepustí', async ({ page }) => {
    await page.goto('/kiosk');
    await page.getByRole('button', { name: new RegExp(ZAMESTNANEC) }).click();
    for (const c of '9999') {
      await page.getByRole('button', { name: c, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Ďalej' }).click();

    await expect(page.getByText('Nesprávny PIN.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ktoré zariadenie?' })).toBeHidden();
  });
});

test.describe('kiosk — izolácia pobočiek', () => {
  test('tablet neponúkne pracovníka inej prevádzky', async ({ page }) => {
    await page.goto('/kiosk');
    await expect(page.getByRole('button', { name: new RegExp(ZAMESTNANEC) })).toBeVisible();
    // Cudzí Kuchár patrí do vedľajšej prevádzky toho istého tenanta.
    await expect(page.getByText('Cudzí Kuchár')).toHaveCount(0);
  });

  test('tablet neponúkne zariadenie inej prevádzky', async ({ page }) => {
    await prihlasSa(page);
    await expect(page.getByRole('button', { name: new RegExp(CHLADNICKA) })).toBeVisible();
    await expect(page.getByText('Chladnička vedľajšia')).toHaveCount(0);
  });
});

test.describe('kiosk — výpadok pripojenia', () => {
  test('meranie bez siete sa uloží do tabletu a odošle po obnovení', async ({
    page,
    context,
  }) => {
    await prihlasSa(page);
    await page.getByRole('button', { name: new RegExp(CHLADNICKA) }).click();

    await context.setOffline(true);
    await zadajHodnotu(page, '2');

    // Operátor musí vidieť, že meranie nie je stratené — inak ho zopakuje.
    await expect(vysledok(page)).toContainText('Bez pripojenia');

    await context.setOffline(false);
    await vysledok(page).click();

    // Fronta sa vyprázdni na pozadí; indikátor čakajúcich meraní zmizne.
    await expect(page.getByText(/čaká na odoslanie/i)).toHaveCount(0, { timeout: 20_000 });
  });
});
