import { getAdminScope } from '@/lib/admin/scope';
import {
  createDevice,
  createDeviceType,
  importDevices,
  toggleDevice,
  updateDeviceLimits,
} from '../manage-actions';

export const dynamic = 'force-dynamic';

type DeviceRow = {
  id: string;
  name: string;
  active: boolean;
  min_c: number | null;
  max_c: number | null;
  device_type_id: string;
  device_types: { name: string } | null;
};

function fmt(v: number | null) {
  return v == null ? '—' : `${Number(v).toLocaleString('sk-SK')} °C`;
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { supabase, locationId } = await getAdminScope();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: deviceRows }, { data: typeRows }, { data: ruleRows }] = await Promise.all([
    supabase
      .from('devices')
      .select('id, name, active, min_c, max_c, device_type_id, device_types(name)')
      .eq('location_id', locationId ?? '')
      .order('sort_order'),
    supabase.from('device_types').select('id, name, code').order('name'),
    supabase
      .from('rules')
      .select('device_type_id, min_c, max_c, valid_from')
      .lte('valid_from', todayIso)
      .or(`valid_to.is.null,valid_to.gt.${todayIso}`)
      .order('valid_from', { ascending: false }),
  ]);

  const devices = (deviceRows ?? []) as unknown as DeviceRow[];
  const types = typeRows ?? [];
  const ruleByType = new Map<string, { min_c: number | null; max_c: number | null }>();
  for (const r of ruleRows ?? []) {
    if (!ruleByType.has(r.device_type_id)) {
      ruleByType.set(r.device_type_id, { min_c: r.min_c, max_c: r.max_c });
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">{msg}</p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pridať zariadenie</h2>
        <form action={createDevice} className="mt-4 grid gap-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
          <input
            name="name"
            required
            placeholder="Názov (napr. Chladnička č. 2)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <select
            name="deviceTypeId"
            required
            className="rounded-lg border border-steel/20 bg-white px-3 py-2 focus:border-steel focus:outline-none"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
          <input
            name="minC"
            type="number"
            step="0.1"
            placeholder="Min °C"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <input
            name="maxC"
            type="number"
            step="0.1"
            placeholder="Max °C"
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
          Min/Max nechaj prázdne, ak má platiť štandardný legislatívny limit typu zariadenia.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Zariadenia</h2>
        {devices.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            Zatiaľ žiadne zariadenia — pridaj prvé vyššie.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-steel/5">
            {devices.map((d) => {
              const rule = ruleByType.get(d.device_type_id);
              const effMin = d.min_c ?? rule?.min_c ?? null;
              const effMax = d.max_c ?? rule?.max_c ?? null;
              return (
                <div
                  key={d.id}
                  className={`flex flex-wrap items-center gap-3 py-3 ${d.active ? '' : 'opacity-50'}`}
                >
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-sm text-steel/50">
                      {d.device_types?.name} · limit {fmt(effMin)} až {fmt(effMax)}
                      {(d.min_c != null || d.max_c != null) && (
                        <span className="ml-1 rounded bg-warn/10 px-1.5 text-xs text-warn">
                          vlastný
                        </span>
                      )}
                    </p>
                  </div>
                  <form action={updateDeviceLimits} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input
                      name="minC"
                      type="number"
                      step="0.1"
                      defaultValue={d.min_c ?? ''}
                      placeholder="Min"
                      className="w-20 rounded-lg border border-steel/20 px-2 py-1.5 text-sm focus:border-steel focus:outline-none"
                    />
                    <input
                      name="maxC"
                      type="number"
                      step="0.1"
                      defaultValue={d.max_c ?? ''}
                      placeholder="Max"
                      className="w-20 rounded-lg border border-steel/20 px-2 py-1.5 text-sm focus:border-steel focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                    >
                      Uložiť limit
                    </button>
                  </form>
                  <form action={toggleDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="active" value={String(!d.active)} />
                    <button
                      type="submit"
                      className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                    >
                      {d.active ? 'Deaktivovať' : 'Aktivovať'}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-steel/50">
          Zariadenia sa nemazú, iba deaktivujú — história meraní musí zostať kompletná (audit).
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Hromadný import</h2>
        <p className="mt-1 text-sm text-steel/60">
          Jeden riadok = jedno zariadenie:{' '}
          <code className="rounded bg-frost px-1">názov;kód typu;min;max</code>. Min a
          max môžu byť prázdne — vtedy platí štandardný limit typu.
        </p>
        <form action={importDevices} className="mt-4 space-y-3">
          <textarea
            name="csv"
            required
            rows={5}
            aria-label="Riadky na import"
            placeholder={'Chladnička kuchyňa;chladnicka;0;5\nMraznička sklad;mraznicka;;-18'}
            className="w-full rounded-lg border border-steel/20 px-3 py-2 font-mono text-sm focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Importovať
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          Ak je čo i len jeden riadok chybný, neimportuje sa nič — čiastočný
          zoznam sa ťažko dohľadáva.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Vlastný typ zariadenia</h2>
        <form action={createDeviceType} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input
            name="name"
            required
            aria-label="Názov typu"
            placeholder="Názov (napr. Šoková chladička)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <input
            name="code"
            required
            pattern="[a-z0-9_]{2,30}"
            aria-label="Kód typu"
            placeholder="kod_typu"
            className="rounded-lg border border-steel/20 px-3 py-2 font-mono focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Pridať typ
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          Vlastný typ nemá legislatívny limit — nastav ho priamo na zariadení.
        </p>
      </section>
    </div>
  );
}
