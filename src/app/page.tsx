import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Digitálny HACCP denník</h1>
        <p className="mt-2 text-steel/70">
          Evidencia teplôt, ktorá obstojí pri kontrole
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/kiosk"
          className="rounded-xl bg-steel px-8 py-4 text-center text-lg font-semibold text-white hover:bg-ink"
        >
          Kiosk (kuchyňa)
        </Link>
        <Link
          href="/login"
          className="rounded-xl border-2 border-steel px-8 py-4 text-center text-lg font-semibold text-steel hover:bg-steel hover:text-white"
        >
          Prihlásenie (admin)
        </Link>
      </div>
    </main>
  );
}
