'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { pairKiosk } from './actions';

export default function PairForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await pairKiosk({ code });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink p-6 text-white">
      <h1 className="text-3xl font-bold">Spárovanie kiosku</h1>
      <p className="mt-2 text-white/60">
        Zadaj párovací kód tabletu (dostaneš ho od administrátora).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-8 flex w-full max-w-xs flex-col gap-4"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          autoFocus
          className="rounded-xl bg-steel px-4 py-4 text-center text-2xl font-bold tracking-[0.3em] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        {error && <p className="text-center text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending || code.trim().length < 4}
          className="rounded-xl bg-ok py-4 text-xl font-bold disabled:opacity-40"
        >
          {pending ? 'Párujem…' : 'Spárovať'}
        </button>
      </form>
    </main>
  );
}
