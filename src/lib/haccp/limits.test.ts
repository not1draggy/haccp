import { describe, expect, it } from 'vitest';
import { evaluateStatus, resolveLimits } from './limits';

describe('resolveLimits', () => {
  it('berie globálne pravidlo, keď zariadenie vlastný limit nemá', () => {
    expect(resolveLimits({ min_c: null, max_c: null }, { min_c: 0, max_c: 5 })).toEqual({
      minC: 0,
      maxC: 5,
    });
  });

  it('vlastný limit zariadenia má prednosť pred pravidlom', () => {
    expect(resolveLimits({ min_c: 1, max_c: 3 }, { min_c: 0, max_c: 5 })).toEqual({
      minC: 1,
      maxC: 3,
    });
  });

  it('prednosť sa rieši pre každú hranicu zvlášť', () => {
    // Zariadenie má len maximum — minimum si musí vziať z pravidla.
    expect(resolveLimits({ min_c: null, max_c: 3 }, { min_c: 0, max_c: 5 })).toEqual({
      minC: 0,
      maxC: 3,
    });
  });

  it('nula je platný limit, nie „nenastavené"', () => {
    // Klasická pasca: 0 je falsy, takže `device.min_c || rule.min_c` by tu
    // ticho vrátilo limit z pravidla a mraznička by merala podľa chladničky.
    expect(resolveLimits({ min_c: 0, max_c: 0 }, { min_c: -18, max_c: 99 })).toEqual({
      minC: 0,
      maxC: 0,
    });
  });

  it('číselné hodnoty z DB prichádzajú ako reťazce (numeric) a musia sa previesť', () => {
    expect(resolveLimits({ min_c: '-18.0', max_c: '-15.5' }, null)).toEqual({
      minC: -18,
      maxC: -15.5,
    });
  });

  it('chýbajúce pravidlo aj zariadenie znamená limit bez hraníc', () => {
    expect(resolveLimits(null, null)).toEqual({ minC: null, maxC: null });
  });
});

describe('evaluateStatus', () => {
  it('hodnota v rozsahu je ok', () => {
    expect(evaluateStatus(3, { minC: 0, maxC: 5 })).toBe('ok');
  });

  it('pod minimom je alarm', () => {
    expect(evaluateStatus(-1, { minC: 0, maxC: 5 })).toBe('alarm');
  });

  it('nad maximom je alarm', () => {
    expect(evaluateStatus(7.1, { minC: 0, maxC: 5 })).toBe('alarm');
  });

  it('hodnota presne na hranici ešte vyhovuje', () => {
    // Inak by chladnička nastavená na 5 °C hlásila poplach pri korektnom meraní.
    expect(evaluateStatus(0, { minC: 0, maxC: 5 })).toBe('ok');
    expect(evaluateStatus(5, { minC: 0, maxC: 5 })).toBe('ok');
  });

  it('jednostranný limit kontroluje len svoju hranicu', () => {
    expect(evaluateStatus(-40, { minC: null, maxC: -18 })).toBe('ok');
    expect(evaluateStatus(-10, { minC: null, maxC: -18 })).toBe('alarm');
  });

  it('bez limitu nie je čo porušiť', () => {
    expect(evaluateStatus(300, { minC: null, maxC: null })).toBe('ok');
  });

  it('záporné teploty mrazničky sa vyhodnocujú správne', () => {
    const limits = resolveLimits({ min_c: null, max_c: -18 }, null);
    expect(evaluateStatus(-22, limits)).toBe('ok');
    expect(evaluateStatus(-18, limits)).toBe('ok');
    expect(evaluateStatus(-17.9, limits)).toBe('alarm');
  });
});
