import { createClient } from '@/lib/supabase/server';
import { createLocation, toggleLocation } from '../manage-actions';

export const dynamic = 'force-dynamic';

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const supabase = await createClient();

  const [{ data: rows }, { data: deviceRows }] = await Promise.all([
    supabase.from('locations').select('id, name, active').order('created_at'),
    supabase.from('devices').select('id, location_id').eq('active', true),
  ]);

  const locations = rows ?? [];
  const deviceCount = new Map<string, number>();
  for (const d of deviceRows ?? []) {
    deviceCount.set(d.location_id, (deviceCount.get(d.location_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p role="status" className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">
          {msg}
        </p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pridať prevádzku</h2>
        <form action={createLocation} className="mt-4 grid gap-3 sm:grid-cols-[2fr_auto]">
          <input
            name="name"
            required
            aria-label="Názov prevádzky"
            placeholder="Názov (napr. Pobočka Ružinov)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Pridať
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          Zariadenia, kiosky a merania patria vždy konkrétnej prevádzke. Medzi
          prevádzkami sa prepína v hlavičke.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Prevádzky</h2>
        <div className="mt-4 divide-y divide-steel/5">
          {locations.map((l) => (
            <div
              key={l.id}
              className={`flex flex-wrap items-center gap-3 py-3 ${l.active ? '' : 'opacity-50'}`}
            >
              <div className="min-w-40 flex-1">
                <p className="font-semibold">{l.name}</p>
                <p className="text-sm text-steel/50">
                  {deviceCount.get(l.id) ?? 0} aktívnych zariadení
                </p>
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
          ))}
        </div>
        <p className="mt-3 text-xs text-steel/50">
          Prevádzky sa nemažú, iba deaktivujú — merania z nich musia zostať dohľadateľné.
        </p>
      </section>
    </div>
  );
}
