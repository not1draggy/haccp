import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { inviteAdmin, revokeInvitation } from '../manage-actions';

export const dynamic = 'force-dynamic';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const supabase = await createClient();

  const [{ data: adminRows }, { data: inviteRows }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, display_name, active, created_at')
      .eq('role', 'tenant_admin')
      .order('created_at'),
    supabase
      .from('invitations')
      .select('id, email, display_name, expires_at, accepted_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const admins = adminRows ?? [];
  const invites = inviteRows ?? [];

  // Token sa zobrazí jediný raz, hneď po vytvorení — v DB je len jeho hash.
  const freshToken = msg?.startsWith('token:') ? msg.slice('token:'.length) : null;
  const notice = msg && !freshToken ? msg : null;

  const host = (await headers()).get('host') ?? '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const inviteUrl = freshToken ? `${proto}://${host}/invite/${freshToken}` : null;

  return (
    <div className="space-y-6">
      {notice && (
        <p role="status" className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">
          {notice}
        </p>
      )}

      {inviteUrl && (
        <section role="status" className="rounded-2xl border border-ok/30 bg-ok/5 p-6">
          <h2 className="text-lg font-bold">Pozvánka vytvorená</h2>
          <p className="mt-1 text-sm text-steel/70">
            Odošli tento odkaz pozvanému. <strong>Zobrazuje sa iba teraz</strong> — v
            databáze je uložený len jeho odtlačok, takže sa už nedá znova vypísať.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-white p-3 text-sm">
            {inviteUrl}
          </code>
        </section>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pozvať administrátora</h2>
        <form action={inviteAdmin} className="mt-4 grid gap-3 sm:grid-cols-[2fr_2fr_auto]">
          <input
            name="displayName"
            required
            aria-label="Meno pozvaného"
            placeholder="Meno (napr. Eva Vedúca)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <input
            name="email"
            type="email"
            required
            aria-label="Email pozvaného"
            placeholder="email@prevadzka.sk"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Vytvoriť pozvánku
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          Pozvánka platí 7 dní. Odosielanie emailov zatiaľ nie je zapojené, preto
          odkaz pošli sám.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Administrátori</h2>
        <div className="mt-4 divide-y divide-steel/5">
          {admins.map((a) => (
            <div key={a.id} className={`py-3 ${a.active ? '' : 'opacity-50'}`}>
              <p className="font-semibold">{a.display_name}</p>
              <p className="text-sm text-steel/50">od {formatDate(a.created_at)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pozvánky</h2>
        {invites.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">Žiadne pozvánky.</p>
        ) : (
          <div className="mt-4 divide-y divide-steel/5">
            {invites.map((i) => {
              const expired = new Date(i.expires_at) < new Date();
              const state = i.accepted_at
                ? `prijatá ${formatDate(i.accepted_at)}`
                : expired
                  ? 'neplatná'
                  : `platí do ${formatDate(i.expires_at)}`;
              return (
                <div
                  key={i.id}
                  className={`flex flex-wrap items-center gap-3 py-3 ${
                    i.accepted_at || expired ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold">{i.display_name}</p>
                    <p className="text-sm text-steel/50">
                      {i.email} · {state}
                    </p>
                  </div>
                  {!i.accepted_at && !expired && (
                    <form action={revokeInvitation}>
                      <input type="hidden" name="id" value={i.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                      >
                        Zneplatniť
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
