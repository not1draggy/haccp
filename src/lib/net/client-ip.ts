/**
 * Výber IP klienta z hlavičiek proxy.
 *
 * `x-forwarded-for` je zoznam, do ktorého každý proxy pripisuje sprava.
 * Ľavý koniec teda pochádza od klienta a dá sa ľubovoľne podvrhnúť — kto
 * si ho nastaví sám, obíde akýkoľvek limit postavený na IP tým, že si pri
 * každom pokuse vymyslí inú. Berieme preto pravý koniec, ktorý pripísal
 * najbližší proxy, a pred ním uprednostníme hlavičky, ktoré klient
 * ovplyvniť nevie.
 */
export function pickClientIp(get: (name: string) => string | null | undefined): string {
  // Vercel tieto dve nastavuje sám a klientske hodnoty prepíše.
  const vercel = get('x-vercel-forwarded-for')?.trim();
  if (vercel) return vercel.split(',').pop()!.trim();

  const real = get('x-real-ip')?.trim();
  if (real) return real;

  const forwarded = get('x-forwarded-for');
  if (forwarded) {
    const posledny = forwarded.split(',').pop()?.trim();
    if (posledny) return posledny;
  }

  // Bez proxy hlavičky padáme na spoločný kľúč — limit tým platí pre všetkých
  // naraz, čo je stále lepšie než žiadny.
  return 'unknown';
}
