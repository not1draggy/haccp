import { getKioskSession } from '@/lib/kiosk/session';
import { createServiceClient } from '@/lib/supabase/service';
import KioskFlow, { type KioskDevice, type KioskEmployee } from './KioskFlow';
import PairForm from './PairForm';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  const session = await getKioskSession();

  if (!session) {
    return <PairForm />;
  }

  const supabase = createServiceClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: employeeRows }, { data: deviceRows }, { data: ruleRows }, { data: lastRows }] =
    await Promise.all([
      supabase
        .from('memberships')
        .select('id, display_name')
        .eq('tenant_id', session.tenantId)
        .eq('role', 'employee')
        .eq('active', true)
        .order('display_name'),
      supabase
        .from('devices')
        .select('id, name, device_type_id, min_c, max_c, device_types(name)')
        .eq('tenant_id', session.tenantId)
        .eq('location_id', session.locationId)
        .eq('active', true)
        .order('sort_order'),
      supabase
        .from('rules')
        .select('device_type_id, min_c, max_c, valid_from')
        .lte('valid_from', todayIso)
        .or(`valid_to.is.null,valid_to.gt.${todayIso}`)
        .order('valid_from', { ascending: false }),
      supabase
        .from('measurements')
        .select('device_id, value_c, status, measured_at')
        .eq('tenant_id', session.tenantId)
        .order('measured_at', { ascending: false })
        .limit(300),
    ]);

  // Prvé (najnovšie) pravidlo per typ zariadenia.
  const ruleByType = new Map<string, { min_c: number | null; max_c: number | null }>();
  for (const r of ruleRows ?? []) {
    if (!ruleByType.has(r.device_type_id)) {
      ruleByType.set(r.device_type_id, { min_c: r.min_c, max_c: r.max_c });
    }
  }

  // Posledné meranie per zariadenie.
  const lastByDevice = new Map<
    string,
    { value_c: number; status: 'ok' | 'alarm'; measured_at: string }
  >();
  for (const m of lastRows ?? []) {
    if (!lastByDevice.has(m.device_id)) {
      lastByDevice.set(m.device_id, {
        value_c: m.value_c,
        status: m.status,
        measured_at: m.measured_at,
      });
    }
  }

  const employees: KioskEmployee[] = employeeRows ?? [];
  const devices: KioskDevice[] = (deviceRows ?? []).map((d) => {
    const type = d.device_types as unknown as { name: string } | null;
    const rule = ruleByType.get(d.device_type_id);
    const last = lastByDevice.get(d.id);
    return {
      id: d.id,
      name: d.name,
      type_name: type?.name ?? '',
      minC: d.min_c != null ? Number(d.min_c) : rule?.min_c != null ? Number(rule.min_c) : null,
      maxC: d.max_c != null ? Number(d.max_c) : rule?.max_c != null ? Number(rule.max_c) : null,
      lastValue: last ? Number(last.value_c) : null,
      lastStatus: last?.status ?? null,
      lastAt: last?.measured_at ?? null,
      measuredToday: last
        ? new Date(last.measured_at).toDateString() === new Date().toDateString()
        : false,
    };
  });

  return (
    <KioskFlow kioskName={session.kioskName} employees={employees} devices={devices} />
  );
}
