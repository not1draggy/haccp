import { getAdminScope } from '@/lib/admin/scope';
import { createLocation, renameTenant, toggleLocation } from '../manage-actions';

export const dynamic = 'force-dynamic';

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { supabase } = await getAdminScope();

  const [{ data: tenant }, { data: rows }, { data: deviceRows }, { data: kioskRows }] =
    await Promise.all([
      supabase.from('tenants').select('name').maybeSingle(),
      supabase.from('locations').select('id, name, active').order('created_at'),
      supabase.from('devices').select('id, location_id').eq('active', true),
      supabase
        .from('kiosk_devices')
        .select('id, location_id, pairing_code, paired_at')
        .eq('active', true),
    ]);

  const locations = rows ?? [];

  const deviceCount = new Map<string, number>();
  for (const d of deviceRows ?? []) {
    deviceCount.set(d.location_id, (deviceCount.get(d.location_id) ?? 0) + 1);
  }

  const kiosksByLocation = new Map<
    string,
    { pairing_code: string; paired_at: string | null }[]
  >();
  for (const k of kioskRows ?? []) {
    const list = kiosksByLocation.get(k.location_id) ?? [];
    list.push({ pairing_code: k.pairing_code, paired_at: k.paired_at });
    kiosksByLocation.set(k.location_id, list);
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p role="status" className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">
          {msg}
        </p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Názov firmy</h2>
        <p className="mt-1 text-sm text-steel/60">
          Zobrazuje sa v hlavičke a v podkladoch, ktoré odovzdávaš kontrole.
        </p>
        <form action={renameTenant} className="mt-4 grid gap-3 sm:grid-cols-[2fr_auto]">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={tenant?.name ?? ''}
            aria-label="Názov firmy"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Uložiť názov
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pridať prevádzku</h2>
        <form action={createLocation} className="mt-4 grid gap-3 sm:grid-cols-[2fr_auto]">
          <input
            name="name"
            required
            aria-label="Názov prevádzky"
            placeholder="Názov (napr. Bistro Kalša)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Vytvoriť prevádzku
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          Spolu s prevádzkou sa rovno vytvorí jej tablet a vygeneruje párovací
          kód — uvidíš ho hneď v zozname nižšie. Každá prevádzka má vlastný kód
          a jej tablet nevidí zariadenia ani zamestnancov iných prevádzok.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Prevádzky</h2>
        <div className="mt-4 divide-y divide-steel/5">
          {locations.map((l) => {
            const kiosks = kiosksByLocation.get(l.id) ?? [];
            const unpaired = kiosks.filter((k) => !k.paired_at);
            return (
              <div
                key={l.id}
                className={`flex flex-wrap items-center gap-3 py-3 ${l.active ? '' : 'opacity-50'}`}
              >
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-sm text-steel/50">
                    {deviceCount.get(l.id) ?? 0} zariadení · {kiosks.length} tabletov
                  </p>
                  {unpaired.length > 0 && (
                    <p className="mt-1 text-sm">
                      <span className="text-steel/50">kód na spárovanie: </span>
                      {unpaired.map((k) => (
                        <span
                          key={k.pairing_code}
                          className="mr-2 font-mono font-bold tracking-widest text-ink"
                        >
                          {k.pairing_code}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <form action={toggleLocation}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="active" value={String(!l.active)} />
                  <button
                    type="submit"
                    className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                  >
                    {l.active ? 'Deaktivovať' : 'Aktivovať'}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-steel/50">
          Prevádzky sa nemažú, iba deaktivujú — merania z nich musia zostať
          dohľadateľné pri kontrole.
        </p>
      </section>
    </div>
  );
}
