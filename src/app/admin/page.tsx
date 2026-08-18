import { getAdminScope } from '@/lib/admin/scope';
import { NO_LOCATION } from '@/lib/admin/constants';
import { addCorrectiveAction } from './manage-actions';

export const dynamic = 'force-dynamic';

type CorrectiveAction = { id: string; action: string; created_at: string };

type MeasurementRow = {
  id: string;
  device_id: string;
  value_c: number;
  status: 'ok' | 'alarm';
  measured_at: string;
  devices: { name: string } | null;
  memberships: { display_name: string } | null;
  corrective_actions: CorrectiveAction[] | null;
};

type MissedRow = {
  id: string;
  due_at: string;
  devices: { name: string } | null;
};

type SkipRow = {
  id: string;
  reason: string;
  skipped_at: string;
  devices: { name: string } | null;
  memberships: { display_name: string } | null;
};

const SELECT =
  'id, device_id, value_c, status, measured_at, devices(name), memberships(display_name), corrective_actions(id, action, created_at)';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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

/** Alarm bez zaznamenaného opatrenia je pri kontrole problém — preto je
 *  formulár priamo pri alarme, nie schovaný v detaile. */
function AlarmCard({ m }: { m: MeasurementRow }) {
  const actions = m.corrective_actions ?? [];
  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {m.devices?.name ?? '—'}{' '}
          <span className="font-bold text-danger">
            {Number(m.value_c).toLocaleString('sk-SK')} °C
          </span>
        </p>
        <p className="text-sm text-steel/50">
          {formatTime(m.measured_at)} · {m.memberships?.display_name ?? '—'}
        </p>
      </div>

      {actions.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {actions.map((a) => (
            <li key={a.id} className="text-sm text-steel/80">
              <span className="text-steel/50">{formatTime(a.created_at)}:</span> {a.action}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-semibold text-warn">
          Zatiaľ bez nápravného opatrenia
        </p>
      )}

      <form action={addCorrectiveAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="measurementId" value={m.id} />
        <input
          name="action"
          required
          maxLength={2000}
          placeholder="Čo sa urobilo (napr. tovar presunutý, privolaný servis)"
          className="min-w-48 flex-1 rounded-lg border border-steel/20 bg-white px-3 py-2 text-sm focus:border-steel focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-steel px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-ink"
        >
          Zaznamenať
        </button>
      </form>
    </div>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { supabase, locationId, locationName } = await getAdminScope();
  const loc = locationId ?? NO_LOCATION;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    { data: alarms },
    { data: today },
    { data: deviceRows },
    { data: missedRows },
    { data: skipRows },
  ] = await Promise.all([
    supabase
      .from('measurements')
      .select(SELECT)
      .eq('location_id', loc)
      .eq('status', 'alarm')
      .gte('measured_at', sevenDaysAgo)
      .order('measured_at', { ascending: false })
      .limit(50),
    supabase
      .from('measurements')
      .select(SELECT)
      .eq('location_id', loc)
      .gte('measured_at', todayStart.toISOString())
      .order('measured_at', { ascending: false })
      .limit(200),
    supabase
      .from('devices')
      .select('id, name')
      .eq('active', true)
      .eq('location_id', loc)
      .order('sort_order'),
    supabase
      .from('missed_checks')
      .select('id, due_at, devices(name)')
      .eq('location_id', loc)
      .gte('due_at', sevenDaysAgo)
      .order('due_at', { ascending: false })
      .limit(50),
    supabase
      .from('check_skips')
      .select('id, reason, skipped_at, devices(name), memberships(display_name)')
      .eq('location_id', loc)
      .gte('skipped_at', sevenDaysAgo)
      .order('skipped_at', { ascending: false })
      .limit(50),
  ]);

  const alarmRows = (alarms ?? []) as unknown as MeasurementRow[];
  const todayRows = (today ?? []) as unknown as MeasurementRow[];
  const devices = deviceRows ?? [];

  // Párovanie podľa device_id — názvy zariadení nie sú unikátne.
  const todayByDevice = new Map<string, MeasurementRow>();
  for (const m of todayRows) {
    if (!todayByDevice.has(m.device_id)) todayByDevice.set(m.device_id, m);
  }
  const measuredCount = devices.filter((d) => todayByDevice.has(d.id)).length;

  const unresolvedAlarms = alarmRows.filter(
    (m) => (m.corrective_actions ?? []).length === 0,
  ).length;

  const missed = (missedRows ?? []) as unknown as MissedRow[];
  const skips = (skipRows ?? []) as unknown as SkipRow[];

  // Bez rozvrhu sa zmeškanie nedá zistiť — prázdny zoznam by inak vyzeral
  // ako "všetko v poriadku", čo je nebezpečne zavádzajúce.
  const { count: scheduleCount } = await supabase
    .from('schedules')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);
  const hasSchedules = (scheduleCount ?? 0) > 0;

  const monthAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">{msg}</p>}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Dnes odmerať
            {locationName && (
              <span className="ml-2 text-sm font-normal text-steel/50">{locationName}</span>
            )}
          </h2>
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
              const m = todayByDevice.get(d.id);
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Alarmy — posledných 7 dní</h2>
          <div className="flex items-center gap-2">
            {unresolvedAlarms > 0 && (
              <span className="rounded-full bg-warn/10 px-3 py-1 text-sm font-semibold text-warn">
                {unresolvedAlarms} bez opatrenia
              </span>
            )}
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                alarmRows.length > 0 ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'
              }`}
            >
              {alarmRows.length}
            </span>
          </div>
        </div>
        {alarmRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">Žiadne alarmy. 👍</p>
        ) : (
          <div className="mt-4 space-y-3">
            {alarmRows.map((m) => (
              <AlarmCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Zmeškané kontroly — 7 dní</h2>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              missed.length > 0 ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'
            }`}
          >
            {missed.length}
          </span>
        </div>
        {missed.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            {hasSchedules
              ? 'Žiadne zmeškané kontroly. 👍'
              : 'Zatiaľ nemáš rozvrhy — bez nich systém nevie, že sa na zariadenie zabudlo. Nastav ich v sekcii Rozvrhy.'}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-steel/5">
            {missed.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <span className="font-semibold">{m.devices?.name ?? '—'}</span>{' '}
                <span className="text-steel/60">
                  nebola odmeraná do {formatTime(m.due_at)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {skips.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-bold uppercase text-steel/50">
              Vedome preskočené
            </h3>
            <ul className="mt-2 divide-y divide-steel/5">
              {skips.map((s) => (
                <li key={s.id} className="py-2 text-sm">
                  <span className="font-semibold">{s.devices?.name ?? '—'}</span>{' '}
                  <span className="text-steel/60">
                    — {s.reason} ({s.memberships?.display_name ?? '—'},{' '}
                    {formatTime(s.skipped_at)})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Dnešné merania</h2>
        <div className="mt-4">
          <MeasurementTable rows={todayRows} empty="Dnes zatiaľ žiadne merania." />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Export pre kontrolu</h2>
        <p className="mt-1 text-sm text-steel/60">
          PDF je podpísateľný podklad pre kontrolu, CSV slúži na ďalšie
          spracovanie. Obe obsahujú merania aj nápravné opatrenia za obdobie.
        </p>
        <form
          action="/admin/export"
          method="get"
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="text-sm font-medium">
            Od
            <input
              type="date"
              name="from"
              defaultValue={isoDate(monthAgo)}
              className="mt-1 w-full rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium">
            Do
            <input
              type="date"
              name="to"
              defaultValue={isoDate(new Date())}
              className="mt-1 w-full rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
            />
          </label>
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              formAction="/admin/report"
              className="rounded-lg bg-steel px-5 py-2 font-semibold text-white transition-colors duration-150 hover:bg-ink"
            >
              Report (PDF)
            </button>
            <button
              type="submit"
              className="rounded-lg border-2 border-steel px-5 py-2 font-semibold text-steel transition-colors duration-150 hover:bg-steel hover:text-white"
            >
              CSV
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
