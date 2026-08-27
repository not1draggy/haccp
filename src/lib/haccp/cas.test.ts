import { describe, expect, it } from 'vitest';
import { denVPasme, jeRovnakyDen, koniecDna, zaciatokDna } from './cas';

describe('denVPasme', () => {
  it('meranie o 00:30 miestneho času patrí do nového dňa, nie do predošlého', () => {
    // 2026-08-15 00:30 v Bratislave (letný čas, UTC+2) = 2026-08-14 22:30 UTC.
    expect(denVPasme(new Date('2026-08-14T22:30:00Z'))).toBe('2026-08-15');
  });

  it('meranie o 23:30 miestneho času ešte patrí do toho istého dňa', () => {
    expect(denVPasme(new Date('2026-08-15T21:30:00Z'))).toBe('2026-08-15');
  });

  it('funguje aj v zimnom čase (UTC+1)', () => {
    expect(denVPasme(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
  });
});

describe('jeRovnakyDen', () => {
  it('rozozná meranie z včerajšieho večera', () => {
    const teraz = new Date('2026-08-15T08:00:00Z');
    expect(jeRovnakyDen('2026-08-14T20:00:00Z', teraz)).toBe(false);
  });

  it('meranie z dnešnej noci berie ako dnešné', () => {
    const teraz = new Date('2026-08-15T08:00:00Z');
    expect(jeRovnakyDen('2026-08-14T22:30:00Z', teraz)).toBe(true);
  });
});

describe('hranice obdobia', () => {
  it('deň v lete začína o 22:00 UTC predošlého dňa', () => {
    expect(zaciatokDna('2026-08-01').toISOString()).toBe('2026-07-31T22:00:00.000Z');
  });

  it('deň v zime začína o 23:00 UTC predošlého dňa', () => {
    expect(zaciatokDna('2026-01-01').toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });

  it('koniec dňa je tesne pred polnocou miestneho času', () => {
    expect(koniecDna('2026-08-31').toISOString()).toBe('2026-08-31T21:59:59.999Z');
  });

  it('obdobie pokrýva celý deň bez diery a bez presahu', () => {
    const koniec = koniecDna('2026-08-01').getTime();
    const dalsiZaciatok = zaciatokDna('2026-08-02').getTime();
    expect(dalsiZaciatok - koniec).toBe(1);
  });
});
