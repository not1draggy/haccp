import Link from 'next/link';

/**
 * Bez tejto stránky ukáže Next.js pri preklepe v URL vlastnú anglickú
 * hlášku „This page could not be found" — v slovenskom produkte pre
 * kuchyňu pôsobí ako chyba nasadenia.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Stránka neexistuje</h1>
        <p className="mt-2 max-w-md text-steel/70">
          Odkaz je pravdepodobne zastaraný alebo obsahuje preklep.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/kiosk"
          className="rounded-xl bg-steel px-8 py-3 font-semibold text-white transition-colors duration-150 hover:bg-ink"
        >
          Kiosk (kuchyňa)
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border-2 border-steel px-8 py-3 font-semibold text-steel transition-colors duration-150 hover:bg-steel hover:text-white"
        >
          Administrácia
        </Link>
      </div>
    </main>
  );
}
