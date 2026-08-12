import { getAdminScope } from '@/lib/admin/scope';
import { NO_LOCATION } from '@/lib/admin/constants';
import { CSV_BOM, csvRow } from '@/lib/export/csv';

export const dynamic = 'force-dynamic';

type ExportRow = {
  measured_at: string;
  value_c: number;
  status: 'ok' | 'alarm';
  devices: { name: string } | null;
  memberships: { display_name: string } | null;
  corrective_actions: { action: string; created_at: string }[] | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function GET(request: Request) {
  const { supabase, locationId } = await getAdminScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Neautorizované', { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  // Predvolene posledných 31 dní — bežné obdobie pre mesačnú kontrolu.
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00`)
    : new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(`${toParam}T23:59:59.999`) : new Date();

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return new Response('Neplatné obdobie', { status: 400 });
  }

  // RLS obmedzí výsledok na tenanta prihláseného používateľa.
  const { data, error } = await supabase
    .from('measurements')
    .select(
      'measured_at, value_c, status, devices(name), memberships(display_name), corrective_actions(action, created_at)',
    )
    .eq('location_id', locationId ?? NO_LOCATION)
    .gte('measured_at', from.toISOString())
    .lte('measured_at', to.toISOString())
    .order('measured_at', { ascending: false })
    .limit(10000);

  if (error) {
    return new Response('Export zlyhal', { status: 500 });
  }

  const rows = (data ?? []) as unknown as ExportRow[];

  const header = [
    'Dátum a čas',
    'Zariadenie',
    'Teplota (°C)',
    'Stav',
    'Meral',
    'Nápravné opatrenia',
  ];

  const lines = [
    csvRow(header),
    ...rows.map((r) =>
      csvRow([
        formatDateTime(r.measured_at),
        r.devices?.name ?? '',
        // Desatinná čiarka — sk Excel inak číslo neinterpretuje ako číslo.
        String(Number(r.value_c)).replace('.', ','),
        r.status === 'alarm' ? 'ALARM' : 'OK',
        r.memberships?.display_name ?? '',
        (r.corrective_actions ?? [])
          .map((a) => `${formatDateTime(a.created_at)}: ${a.action}`)
          .join(' | '),
      ]),
    ),
  ];

  const filename = `haccp-merania-${from.toISOString().slice(0, 10)}_${to
    .toISOString()
    .slice(0, 10)}.csv`;

  return new Response(CSV_BOM + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
