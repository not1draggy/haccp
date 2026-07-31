'use client';

import { useEffect } from 'react';

/**
 * Bez tohto boundary skončí akákoľvek server chyba bielou stránkou
 * s "Application error" — v kuchyni na tablete nepoužiteľné.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Niečo sa pokazilo</h1>
        <p className="mt-2 max-w-md text-steel/70">
          Akciu sa nepodarilo dokončiť. Skús to znova — ak problém pretrváva,
          kontaktuj správcu a uveď kód nižšie.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-steel/50">kód: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-steel px-8 py-3 font-semibold text-white transition-colors duration-150 hover:bg-ink"
        >
          Skúsiť znova
        </button>
        <a
          href="/"
          className="rounded-xl border-2 border-steel px-8 py-3 font-semibold text-steel transition-colors duration-150 hover:bg-steel hover:text-white"
        >
          Na úvod
        </a>
      </div>
    </main>
  );
}
