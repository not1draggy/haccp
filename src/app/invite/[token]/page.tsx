import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { acceptInvitation } from './actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  weak: 'Heslo musí mať aspoň 8 znakov.',
  invalid: 'Pozvánka je neplatná alebo už bola použitá.',
  account: 'Účet sa nepodarilo vytvoriť.',
  membership: 'Priradenie k prevádzke zlyhalo.',
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const admin = createServiceClient();
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const { data: invite } = await admin
    .from('invitations')
    .select('email, display_name, expires_at, accepted_at, tenants(name)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  const tenant = invite?.tenants as unknown as { name: string } | null;
  const usable =
    invite && !invite.accepted_at && new Date(invite.expires_at) >= new Date();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        {!usable ? (
          <>
            <h1 className="text-2xl font-bold">Pozvánka neplatí</h1>
            <p className="mt-2 text-sm text-steel/70">
              Odkaz je neplatný, expiroval alebo už bol použitý. Požiadaj
              administrátora o novú pozvánku.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Pozvánka do prevádzky</h1>
            <p className="mt-1 text-sm text-steel/60">
              {tenant?.name ?? 'Prevádzka'} — {invite.display_name}
            </p>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {ERRORS[error] ?? 'Niečo sa pokazilo.'}
              </p>
            )}

            <form action={acceptInvitation} className="mt-6">
              <input type="hidden" name="token" value={token} />

              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  value={invite.email}
                  readOnly
                  aria-readonly="true"
                  className="mt-1 w-full rounded-lg border border-steel/20 bg-frost px-3 py-2 text-steel/70"
                />
              </label>

              <label className="mt-4 block text-sm font-medium">
                Zvoľ si heslo
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
                />
              </label>

              <button
                type="submit"
                className="mt-6 w-full rounded-lg bg-steel py-2.5 font-semibold text-white hover:bg-ink"
              >
                Prijať pozvánku
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
