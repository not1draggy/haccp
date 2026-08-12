import { getAdminScope } from '@/lib/admin/scope';
import { NO_LOCATION } from '@/lib/admin/constants';
import { createKiosk, toggleKiosk, unpairKiosk } from '../manage-actions';

export const dynamic = 'force-dynamic';

export default async function KiosksPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { supabase, locationId } = await getAdminScope();

  const { data: rows } = await supabase
    .from('kiosk_devices')
    .select('id, name, pairing_code, paired_at, last_seen_at, active')
    .eq('location_id', locationId ?? NO_LOCATION)
    .order('created_at');

  const kiosks = rows ?? [];

  return (
    <div className="space-y-6">
      {msg && (
        <p className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">{msg}</p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pridať kiosk (tablet)</h2>
        <form action={createKiosk} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input
            name="name"
            required
            aria-label="Názov kiosku"
            placeholder="Názov (napr. Tablet kuchyňa)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <input
            name="pairingCode"
            pattern="[A-Za-z0-9]{6,12}"
            aria-label="Vlastný párovací kód (voliteľné)"
            placeholder="Kód (voliteľné)"
            className="rounded-lg border border-steel/20 px-3 py-2 font-mono uppercase focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Pridať
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          Kód si môžeš zvoliť (napr. podľa pobočky), inak sa vygeneruje. Zadáš ho
          raz na tablete na adrese /kiosk. Tablet potom vidí výhradne zariadenia
          a zamestnancov tejto prevádzky.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Kiosky</h2>
        {kiosks.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            Zatiaľ žiadne kiosky — pridaj prvý vyššie.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-steel/5">
            {kiosks.map((k) => (
              <div
                key={k.id}
                className={`flex flex-wrap items-center gap-3 py-3 ${k.active ? '' : 'opacity-50'}`}
              >
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{k.name}</p>
                  <p className="text-sm text-steel/50">
                    {k.paired_at ? (
                      <>
                        spárovaný ·{' '}
                        {k.last_seen_at
                          ? `aktívny ${new Date(k.last_seen_at).toLocaleString('sk-SK', {
                              timeZone: 'Europe/Bratislava',
                              day: 'numeric',
                              month: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : 'bez aktivity'}
                      </>
                    ) : (
                      <>
                        nespárovaný · kód:{' '}
                        <span className="font-mono font-bold tracking-widest text-ink">
                          {k.pairing_code}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {k.paired_at && (
                  <form action={unpairKiosk}>
                    <input type="hidden" name="id" value={k.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                    >
                      Odpojiť tablet
                    </button>
                  </form>
                )}
                <form action={toggleKiosk}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="active" value={String(!k.active)} />
                  <button
                    type="submit"
                    className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                  >
                    {k.active ? 'Deaktivovať' : 'Aktivovať'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
