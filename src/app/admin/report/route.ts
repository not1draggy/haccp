import { getAdminScope } from '@/lib/admin/scope';
import { NO_LOCATION } from '@/lib/admin/constants';
import { renderReport, type ReportMeranie } from '@/lib/report/pdf';

export const dynamic = 'force-dynamic';
// Vykreslenie PDF potrebuje Node API (fonty z disku), Edge runtime nestačí.
export const runtime = 'nodejs';

// Mesiac prevádzky s piatimi zariadeniami je rádovo stovky meraní. Strop je
// tu preto, aby neprimerane dlhé obdobie nevyrobilo stostranové PDF —
// na kompletné dáta je CSV export.
const MAX_RIADKOV = 2000;

type Row = {
  measured_at: string;
  value_c: number;
  status: 'ok' | 'alarm';
  devices: { name: string } | null;
  memberships: { display_name: string } | null;
  corrective_actions: { action: string; created_at: string }[] | null;
};

export async function GET(request: Request) {
  const { supabase, locationId, locationName } = await getAdminScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Neautorizované', { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const from = fromParam
    ? new Date(`${fromParam}T00:00:00`)
    : new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(`${toParam}T23:59:59.999`) : new Date();

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return new Response('Neplatné obdobie', { status: 400 });
  }

  const scope = locationId ?? NO_LOCATION;

  // RLS obmedzí všetko na tenanta prihláseného používateľa.
  const [meraniaRes, tenantRes, zmeskaneRes, preskoceneRes] = await Promise.all([
    supabase
      .from('measurements')
      .select(
        'measured_at, value_c, status, devices(name), memberships(display_name), corrective_actions(action, created_at)',
        { count: 'exact' },
      )
      .eq('location_id', scope)
      .gte('measured_at', from.toISOString())
      .lte('measured_at', to.toISOString())
      .order('measured_at', { ascending: false })
      .limit(MAX_RIADKOV),
    supabase.from('tenants').select('name').limit(1).maybeSingle(),
    supabase
      .from('missed_checks')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', scope)
      .gte('due_at', from.toISOString())
      .lte('due_at', to.toISOString()),
    supabase
      .from('check_skips')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', scope)
      .gte('skipped_at', from.toISOString())
      .lte('skipped_at', to.toISOString()),
  ]);

  if (meraniaRes.error) {
    console.error('[report] načítanie meraní zlyhalo:', meraniaRes.error.message);
    return new Response('Report sa nepodarilo zostaviť', { status: 500 });
  }

  const rows = (meraniaRes.data ?? []) as unknown as Row[];
  const merania: ReportMeranie[] = rows.map((r) => ({
    measured_at: r.measured_at,
    value_c: Number(r.value_c),
    status: r.status,
    device_name: r.devices?.name ?? '—',
    employee_name: r.memberships?.display_name ?? '—',
    corrective_actions: r.corrective_actions ?? [],
  }));

  const pdf = await renderReport({
    firma: tenantRes.data?.name ?? 'Firma',
    prevadzka: locationName ?? 'Prevádzka',
    od: from,
    do: to,
    merania,
    zmeskane: zmeskaneRes.count ?? 0,
    preskocene: preskoceneRes.count ?? 0,
    orezanych: Math.max(0, (meraniaRes.count ?? merania.length) - merania.length),
  });

  const nazov = `haccp-report-${from.toISOString().slice(0, 10)}_${to
    .toISOString()
    .slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nazov}"`,
      'Cache-Control': 'no-store',
    },
  });
}
