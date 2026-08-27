'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { loginKiosk } from './actions';

/**
 * Vstup do kiosku: kód prevádzky + PIN. Vizuálne zhodné s pôvodným
 * párovaním — pribudlo iba druhé pole, aby na otvorenie kuchyne nestačil
 * samotný kód.
 */
export default function LoginForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await loginKiosk({ code, pin });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        setPin('');
      }
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink p-6 text-white">
      <h1 className="text-3xl font-bold">Prihlásenie do prevádzky</h1>
      <p className="mt-2 text-white/60">
        Zadaj kód prevádzky a PIN (dostaneš ich od administrátora).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-8 flex w-full max-w-xs flex-col gap-4"
      >
        <label className="sr-only" htmlFor="kiosk-kod">
          Kód prevádzky
        </label>
        <input
          id="kiosk-kod"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="KÓD PREVÁDZKY"
          autoFocus
          autoComplete="off"
          className="rounded-xl bg-steel px-4 py-4 text-center text-2xl font-bold tracking-[0.3em] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <label className="sr-only" htmlFor="kiosk-pin">
          PIN
        </label>
        <input
          id="kiosk-pin"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          className="rounded-xl bg-steel px-4 py-4 text-center text-2xl font-bold tracking-[0.3em] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        {error && (
          <p role="alert" className="text-center text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || code.trim().length < 4 || pin.length < 4}
          className="rounded-xl bg-ok py-4 text-xl font-bold disabled:opacity-40"
        >
          {pending ? 'Prihlasujem…' : 'Prihlásiť'}
        </button>
      </form>
    </main>
  );
}
