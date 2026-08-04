import Link from 'next/link';
import { getAdminScope } from '@/lib/admin/scope';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type HistoryRow = {
  id: string;
  value_c: number;
  status: 'ok' | 'alarm';
  measured_at: string;
  client_measured_at: string | null;
  note: string | null;
  devices: { name: string } | null;
  memberships: { display_name: string } | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; device?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const from = (page - 1) * PAGE_SIZE;

  const { supabase, locationId } = await getAdminScope();

  let query = supabase
    .from('measurements')
    .select(
      'id, value_c, status, measured_at, client_measured_at, note, devices(name), memberships(display_name)',
      { count: 'exact' },
    )
    .eq('location_id', locationId ?? '')
    .order('measured_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.device) query = query.eq('device_id', params.device);
  if (params.status === 'alarm') query = query.eq('status', 'alarm');

  const [{ data, count }, { data: deviceRows }] = await Promise.all([
    query,
    supabase
      .from('devices')
      .select('id, name')
      .eq('location_id', locationId ?? '')
      .order('sort_order'),
  ]);

  const rows = (data ?? []) as unknown as HistoryRow[];
  const devices = deviceRows ?? [];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const q = new URLSearchParams();
    q.set('page', String(p));
    if (params.device) q.set('device', params.device);
    if (params.status) q.set('status', params.status);
    return `/admin/history?${q.toString()}`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">História meraní</h2>
          <span className="text-sm text-steel/60">{total} záznamov</span>
        </div>

        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <select
            name="device"
            defaultValue={params.device ?? ''}
            aria-label="Filtrovať podľa zariadenia"
            className="rounded-lg border border-steel/20 bg-white px-3 py-2"
          >
            <option value="">Všetky zariadenia</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={params.status ?? ''}
            aria-label="Filtrovať podľa stavu"
            className="rounded-lg border border-steel/20 bg-white px-3 py-2"
          >
            <option value="">Všetky stavy</option>
            <option value="alarm">Iba alarmy</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Filtrovať
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            Žiadne merania pre zvolený filter.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
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
                  <tr key={m.id} className="border-b border-steel/5 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatTime(m.measured_at)}
                      {m.client_measured_at && (
                        <span
                          className="block text-xs text-steel/50"
                          title="Meranie vzniklo offline; autoritatívny je čas zápisu na server."
                        >
                          odmerané {formatTime(m.client_measured_at)} (offline)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{m.devices?.name ?? '—'}</td>
                    <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                      {Number(m.value_c).toLocaleString('sk-SK')} °C
                    </td>
                    <td className="py-2 pr-4">
                      {m.memberships?.display_name ?? '—'}
                      {m.note && (
                        <span className="block text-xs text-steel/50">{m.note}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {m.status === 'ok' ? (
                        <span className="rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">
                          OK
                        </span>
                      ) : (
                        <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          ALARM
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lastPage > 1 && (
          <nav className="mt-4 flex items-center justify-between" aria-label="Stránkovanie">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-lg border border-steel/20 px-4 py-2 text-sm hover:bg-frost"
              >
                ← Novšie
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-steel/60">
              strana {page} z {lastPage}
            </span>
            {page < lastPage ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-lg border border-steel/20 px-4 py-2 text-sm hover:bg-frost"
              >
                Staršie →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
