import { describe, expect, it } from 'vitest';
import { csvCell, csvRow } from './csv';

describe('csvCell — neutralizácia vzorcov', () => {
  // Názvy zariadení a texty opatrení píše používateľ a export otvára
  // vedúci alebo kontrolór vo svojom Exceli.
  it.each([
    ['=HYPERLINK("http://zly.web","klik")', 'vzorec s odkazom'],
    ['=cmd|\'/c calc\'!A0', 'spustenie príkazu'],
    ['+SUM(A1:A9)', 'plus'],
    ['@SUM(A1)', 'zavináč'],
    ['-nazov zariadenia', 'mínus na začiatku textu'],
    ['\tTabulator', 'tabulátor'],
  ])('%s (%s) dostane apostrof', (input) => {
    expect(csvCell(input).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('neutralizovaná bunka aj tak prejde úvodzovkovaním', () => {
    expect(csvCell('=A1;B2')).toBe('"\'=A1;B2"');
  });
});

describe('csvCell — čísla zostávajú číslami', () => {
  it.each([
    ['-18,5', 'záporná teplota s desatinnou čiarkou'],
    ['-18.5', 'záporná teplota s bodkou'],
    ['0', 'nula'],
    ['4,2', 'kladná teplota'],
    ['-273', 'celé záporné číslo'],
  ])('%s (%s) zostáva bez apostrofu', (input) => {
    // Apostrof by z teploty spravil text a Excel by s ňou nepočítal.
    expect(csvCell(input)).toBe(input);
  });
});

describe('csvCell — bežné escapovanie', () => {
  it('bodkočiarka vynúti úvodzovky, lebo je to oddeľovač', () => {
    expect(csvCell('Chladnička; sklad')).toBe('"Chladnička; sklad"');
  });

  it('úvodzovky sa zdvojujú', () => {
    expect(csvCell('Mraznička "veľká"')).toBe('"Mraznička ""veľká"""');
  });

  it('nový riadok ostane v bunke, ale v úvodzovkách', () => {
    expect(csvCell('prvý\ndruhý')).toBe('"prvý\ndruhý"');
  });

  it('diakritika sa nemení', () => {
    expect(csvCell('Chladnička č. 2 — kuchyňa')).toBe('Chladnička č. 2 — kuchyňa');
  });

  it('null aj undefined sú prázdna bunka', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('csvRow', () => {
  it('spája bunky bodkočiarkou', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a;b;c');
  });

  it('riadok exportu s alarmom a opatrením', () => {
    expect(
      csvRow(['12.08.2026 09:15', 'Chladnička č. 2', '-18,5', 'ALARM', 'Peter K.', '']),
    ).toBe('12.08.2026 09:15;Chladnička č. 2;-18,5;ALARM;Peter K.;');
  });
});
