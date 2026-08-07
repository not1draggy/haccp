import Link from 'next/link';
import { signUp } from './actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  invalid: 'Skontroluj vyplnené polia — heslo musí mať aspoň 8 znakov.',
  email: 'Účet s týmto emailom už existuje. Prihlás sa alebo si nechaj poslať pozvánku.',
  tenant: 'Firmu sa nepodarilo založiť. Skús to prosím znova.',
};

const FIELD =
  'mt-1 w-full rounded-lg border border-steel/20 px-3 py-2.5 focus:border-steel focus:outline-none';

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={signUp} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Registrácia firmy</h1>
        <p className="mt-1 text-sm text-steel/60">
          Účet, prvá prevádzka aj kód tabletu vzniknú naraz.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {ERRORS[error] ?? ERRORS.invalid}
          </p>
        )}

        <label className="mt-6 block text-sm font-medium">
          Názov firmy
          <input
            name="company"
            required
            maxLength={120}
            autoComplete="organization"
            placeholder="napr. Gastro Kalša s.r.o."
            className={FIELD}
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Prvá prevádzka
          <input
            name="location"
            required
            maxLength={80}
            placeholder="napr. Bistro Kalša"
            className={FIELD}
          />
          <span className="mt-1 block text-xs font-normal text-steel/50">
            Ďalšie prevádzky pridáš neskôr — každá dostane vlastný kód tabletu
            a navzájom o sebe nevedia.
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Tvoje meno
          <input
            name="displayName"
            required
            maxLength={80}
            autoComplete="name"
            className={FIELD}
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={FIELD} />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Heslo
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={FIELD}
          />
          <span className="mt-1 block text-xs font-normal text-steel/50">Aspoň 8 znakov.</span>
        </label>

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-steel py-2.5 font-semibold text-white transition-colors duration-150 hover:bg-ink"
        >
          Založiť firmu
        </button>

        <p className="mt-4 text-center text-sm text-steel/60">
          Už máš účet?{' '}
          <Link href="/login" className="font-semibold text-ink underline">
            Prihlás sa
          </Link>
        </p>
      </form>
    </main>
  );
}
