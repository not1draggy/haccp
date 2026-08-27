import { defineConfig, devices } from '@playwright/test';

/**
 * E2E testy bežia proti reálne zbehnutej appke. Kiosk flow je jediná cesta,
 * ktorou v tomto produkte vzniká meranie, a doteraz ho neoverovalo nič
 * automatické — unit testy pokrývajú vyhodnotenie limitov, SQL testy izoláciu.
 *
 * POZOR: testy zapisujú merania, ktoré sú append-only a nedajú sa zmazať.
 * Spúšťať výhradne proti jednorazovej databáze (`supabase start`), nikdy
 * proti produkcii — inak zostanú testovacie záznamy navždy v audite zákazníka.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // testy zdieľajú jednu DB aj jeden párovací kód
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // HTML report sa v CI ukladá ako artefakt — bez neho po páde nezostane
  // nič, čo by sa dalo pozrieť.
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'sk-SK',
  },

  projects: [
    // Spáruje tablet raz a uloží cookie. Bez toho by každý test pálil jeden
    // pokus z limitu na párovanie (10 / 15 min) a testy by si ho vyčerpali.
    { name: 'setup', testMatch: /kiosk\.setup\.ts/ },
    {
      name: 'tablet',
      // Kiosk beží na tablete na šírku. Testovať ho v desktop viewporte by
      // minulo presne tie chyby, ktoré sa prejavia až v kuchyni.
      use: { ...devices['Galaxy Tab S4 landscape'], storageState: 'e2e/.auth/kiosk.json' },
      dependencies: ['setup'],
      testMatch: /kiosk\.spec\.ts/,
    },
    {
      name: 'kiosk-prihlasenie',
      use: { ...devices['Galaxy Tab S4 landscape'] }, // zámerne bez cookie
      testMatch: /prihlasenie\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /verejne\.spec\.ts/,
    },
    {
      name: 'mobil',
      use: { ...devices['Pixel 7'] },
      testMatch: /responzivita\.spec\.ts/,
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run start',
        url: 'http://127.0.0.1:3000/',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
