import { describe, expect, it } from 'vitest';
import { pickClientIp } from './client-ip';

/** Pomocník: hlavičky ako obyčajná mapa. */
function hlavicky(map: Record<string, string>) {
  return (name: string) => map[name] ?? null;
}

describe('pickClientIp', () => {
  it('berie pravý koniec x-forwarded-for, nie klientom podvrhnutý ľavý', () => {
    expect(
      pickClientIp(hlavicky({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 203.0.113.7' })),
    ).toBe('203.0.113.7');
  });

  it('podvrhnutá hlavička neobíde limit — hodnota zostáva rovnaká', () => {
    const utocnik = pickClientIp(hlavicky({ 'x-forwarded-for': 'vymyslena, 203.0.113.7' }));
    const bezny = pickClientIp(hlavicky({ 'x-forwarded-for': '203.0.113.7' }));
    expect(utocnik).toBe(bezny);
  });

  it('uprednostní hlavičky, ktoré klient nevie ovplyvniť', () => {
    const h = hlavicky({
      'x-forwarded-for': 'podvrh',
      'x-real-ip': '198.51.100.9',
      'x-vercel-forwarded-for': '203.0.113.7',
    });
    expect(pickClientIp(h)).toBe('203.0.113.7');
  });

  it('x-real-ip má prednosť pred x-forwarded-for', () => {
    expect(
      pickClientIp(hlavicky({ 'x-forwarded-for': 'podvrh', 'x-real-ip': '198.51.100.9' })),
    ).toBe('198.51.100.9');
  });

  it('bez hlavičiek vráti spoločný kľúč, nie prázdny reťazec', () => {
    expect(pickClientIp(hlavicky({}))).toBe('unknown');
  });

  it('prázdna hlavička sa neberie ako platná IP', () => {
    expect(pickClientIp(hlavicky({ 'x-forwarded-for': '   ' }))).toBe('unknown');
  });
});
