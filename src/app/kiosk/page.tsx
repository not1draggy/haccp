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

  const [{ data: employeeRows }, { data: deviceRows }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, display_name')
      .eq('tenant_id', session.tenantId)
      .eq('role', 'employee')
      .eq('active', true)
      .order('display_name'),
    supabase
      .from('devices')
      .select('id, name, device_types(name)')
      .eq('tenant_id', session.tenantId)
      .eq('location_id', session.locationId)
      .eq('active', true)
      .order('sort_order'),
  ]);

  const employees: KioskEmployee[] = employeeRows ?? [];
  const devices: KioskDevice[] = (deviceRows ?? []).map((d) => {
    const type = d.device_types as unknown as { name: string } | null;
    return { id: d.id, name: d.name, type_name: type?.name ?? '' };
  });

  return (
    <KioskFlow kioskName={session.kioskName} employees={employees} devices={devices} />
  );
}
