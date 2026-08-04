import { getAdminScope } from '@/lib/admin/scope';
import { createSchedule, toggleSchedule } from '../manage-actions';

export const dynamic = 'force-dynamic';

type ScheduleRow = {
  id: string;
  due_time: string;
  tolerance_min: number;
  active: boolean;
  device_id: string;
  devices: { name: string } | null;
};

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { supabase, locationId } = await getAdminScope();

  const { data: deviceRows } = await supabase
    .from('devices')
    .select('id, name')
    .eq('active', true)
    .eq('location_id', locationId ?? '')
    .order('sort_order');

  const devices = deviceRows ?? [];

  // schedules nemá location_id — obmedzíme cez zariadenia zvolenej prevádzky,
  // inak by sa medzi rozvrhmi ukázali aj cudzie prevádzky.
  const { data: scheduleRows } = await supabase
    .from('schedules')
    .select('id, due_time, tolerance_min, active, device_id, devices(name)')
    .in('device_id', devices.length > 0 ? devices.map((d) => d.id) : ['00000000-0000-0000-0000-000000000000'])
    .order('due_time');

  const schedules = (scheduleRows ?? []) as unknown as ScheduleRow[];

  return (
    <div className="space-y-6">
      {msg && (
        <p role="status" className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">
          {msg}
        </p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pridať rozvrh merania</h2>
        <form
          action={createSchedule}
          className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <select
            name="deviceId"
            required
            aria-label="Zariadenie"
            className="rounded-lg border border-steel/20 bg-white px-3 py-2 focus:border-steel focus:outline-none"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            name="dueTime"
            type="time"
            required
            defaultValue="10:00"
            aria-label="Čas, dokedy má byť odmerané"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <input
            name="toleranceMin"
            type="number"
            min={5}
            max={720}
            defaultValue={60}
            required
            aria-label="Tolerancia v minútach"
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
          Ak zariadenie nie je odmerané do zadaného času plus tolerancie, systém
          to automaticky zaznamená ako zmeškanú kontrolu. Kontrola sa vedome
          preskočená s dôvodom za zmeškanie nepovažuje.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Rozvrhy</h2>
        {schedules.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            Zatiaľ žiadne rozvrhy. Bez nich systém nevie, že sa na zariadenie zabudlo.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-steel/5">
            {schedules.map((s) => (
              <div
                key={s.id}
                className={`flex flex-wrap items-center gap-3 py-3 ${s.active ? '' : 'opacity-50'}`}
              >
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{s.devices?.name ?? '—'}</p>
                  <p className="text-sm text-steel/50">
                    do {s.due_time.slice(0, 5)} · tolerancia {s.tolerance_min} min
                  </p>
                </div>
                <form action={toggleSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.active)} />
                  <button
                    type="submit"
                    className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                  >
                    {s.active ? 'Vypnúť' : 'Zapnúť'}
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
