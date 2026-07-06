import { login } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        action={login}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Prihlásenie</h1>
        <p className="mt-1 text-sm text-steel/60">Administrácia prevádzky</p>

        {error && (
          <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error === 'auth'
              ? 'Nesprávny email alebo heslo.'
              : 'Zadaj platný email a heslo.'}
          </p>
        )}

        <label className="mt-6 block text-sm font-medium">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Heslo
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
        </label>

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-steel py-2.5 font-semibold text-white hover:bg-ink"
        >
          Prihlásiť sa
        </button>
      </form>
    </main>
  );
}
