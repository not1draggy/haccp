import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type MeasurementRow = {
  id: string;
  value_c: number;
  status: 'ok' | 'alarm';
  measured_at: string;
  devices: { name: string } | null;
  memberships: { display_name: string } | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: 'ok' | 'alarm' }) {
  return status === 'ok' ? (
    <span className="rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">
      OK
    </span>
  ) : (
    <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
      ALARM
    </span>
  );
}

function MeasurementTable({ rows, empty }: { rows: MeasurementRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-steel/50">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-steel/10 text-left text-xs uppercase text-steel/50">
            <th className="py-2 pr-4">Čas</th>
            <th className="py-2 pr-4">Zariadenie</th>
            <th className="py-2 pr-4">Teplota</th>
            <th className="py-2 pr-4">Meral</th>
            <th className="py-2">Stav</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-steel/5">
              <td className="py-2 pr-4 whitespace-nowrap">{formatTime(m.measured_at)}</td>
              <td className="py-2 pr-4">{m.devices?.name ?? '—'}</td>
              <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                {Number(m.value_c).toLocaleString('sk-SK')} °C
              </td>
              <td className="py-2 pr-4">{m.memberships?.display_name ?? '—'}</td>
              <td className="py-2">
                <StatusBadge status={m.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminDashboard() {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const select =
    'id, value_c, status, measured_at, devices(name), memberships(display_name)';

  const [{ data: alarms }, { data: today }, { data: deviceRows }] = await Promise.all([
    supabase
      .from('measurements')
      .select(select)
      .eq('status', 'alarm')
      .gte('measured_at', sevenDaysAgo)
      .order('measured_at', { ascending: false })
      .limit(50),
    supabase
      .from('measurements')
      .select(select)
      .gte('measured_at', todayStart.toISOString())
      .order('measured_at', { ascending: false })
      .limit(200),
    supabase
      .from('devices')
      .select('id, name')
      .eq('active', true)
      .order('sort_order'),
  ]);

  const alarmRows = (alarms ?? []) as unknown as MeasurementRow[];
  const todayRows = (today ?? []) as unknown as MeasurementRow[];
  const devices = deviceRows ?? [];

  // Stav per zariadenie: posledné dnešné meranie, alebo "dnes neodmerané".
  const todayByDevice = new Map<string, MeasurementRow>();
  for (const m of todayRows) {
    const name = m.devices?.name;
    if (name && !todayByDevice.has(name)) todayByDevice.set(name, m);
  }
  const measuredCount = devices.filter((d) => todayByDevice.has(d.name)).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Dnes odmerať</h2>
          <span className="rounded-full bg-frost px-3 py-1 text-sm font-semibold text-steel/70">
            {measuredCount} / {devices.length}
          </span>
        </div>
        {devices.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            Zatiaľ žiadne zariadenia — pridaj ich v sekcii Zariadenia.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => {
              const m = todayByDevice.get(d.name);
              return (
                <div
                  key={d.id}
                  className={`rounded-xl border p-4 ${
                    !m
                      ? 'border-warn/30 bg-warn/5'
                      : m.status === 'alarm'
                        ? 'border-danger/30 bg-danger/5'
                        : 'border-ok/20 bg-ok/5'
                  }`}
                >
                  <p className="font-semibold">{d.name}</p>
                  {m ? (
                    <p className="mt-1 text-sm">
                      <span
                        className={`font-bold ${m.status === 'alarm' ? 'text-danger' : 'text-ok'}`}
                      >
                        {Number(m.value_c).toLocaleString('sk-SK')} °C
                      </span>{' '}
                      <span className="text-steel/50">o {formatTime(m.measured_at)}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-warn">dnes neodmerané</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Alarmy — posledných 7 dní</h2>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              alarmRows.length > 0
                ? 'bg-danger/10 text-danger'
                : 'bg-ok/10 text-ok'
            }`}
          >
            {alarmRows.length}
          </span>
        </div>
        <div className="mt-4">
          <MeasurementTable rows={alarmRows} empty="Žiadne alarmy. 👍" />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Dnešné merania</h2>
        <div className="mt-4">
          <MeasurementTable rows={todayRows} empty="Dnes zatiaľ žiadne merania." />
        </div>
      </section>
    </div>
  );
}
