/**
 * Práca s dátumami v prevádzkovom pásme.
 *
 * Zobrazovanie už `Europe/Bratislava` používalo, ale „dnešok" a hranice
 * obdobia sa počítali cez `toISOString()`, teda v UTC. Server beží v UTC,
 * takže meranie o 00:30 miestneho času spadlo do predošlého dňa a report za
 * august začínal až o 02:00 prvého augusta. Pri dennom zázname, ktorý má
 * obstáť pri kontrole, je „ktorý deň to bolo" súčasť samotného dôkazu.
 */

export const PREVADZKOVE_PASMO = 'Europe/Bratislava';

/** Dátum ako `YYYY-MM-DD` v prevádzkovom pásme. */
export function denVPasme(d: Date = new Date()): string {
  // en-CA formátuje rovno do YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: PREVADZKOVE_PASMO });
}

/** Dnešný dátum v prevádzkovom pásme. */
export function dnesIso(now: Date = new Date()): string {
  return denVPasme(now);
}

/** Padli oba okamihy na ten istý kalendárny deň prevádzky? */
export function jeRovnakyDen(a: string | Date, b: Date = new Date()): boolean {
  return denVPasme(new Date(a)) === denVPasme(b);
}

/** Posun pásma voči UTC v minútach pre daný okamih (rieši aj letný čas). */
function posunMinut(d: Date): number {
  const vPasme = new Date(d.toLocaleString('en-US', { timeZone: PREVADZKOVE_PASMO }));
  const vUtc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return (vPasme.getTime() - vUtc.getTime()) / 60000;
}

/** Okamih polnoci daného dňa v prevádzkovom pásme. */
export function zaciatokDna(denIso: string): Date {
  const polnocUtc = new Date(`${denIso}T00:00:00.000Z`);
  return new Date(polnocUtc.getTime() - posunMinut(polnocUtc) * 60000);
}

/** Posledný okamih daného dňa v prevádzkovom pásme. */
export function koniecDna(denIso: string): Date {
  const koniecUtc = new Date(`${denIso}T23:59:59.999Z`);
  return new Date(koniecUtc.getTime() - posunMinut(koniecUtc) * 60000);
}
