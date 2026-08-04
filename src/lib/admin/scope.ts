import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { LOCATION_COOKIE } from './constants';

export type AdminScope = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  locations: { id: string; name: string }[];
  locationId: string | null;
  locationName: string | null;
};

/**
 * Tenant je vždy jeden (RLS), prevádzok môže byť viac. Zvolená prevádzka
 * sa drží v cookie, ale hodnota sa VŽDY overuje proti zoznamu z DB —
 * podvrhnuté id z prehliadača nič neotvorí, RLS aj tak vráti len prevádzky
 * vlastného tenanta.
 *
 * Bez tohto helpera by zoznamy ukazovali zariadenia zo všetkých prevádzok,
 * zatiaľ čo pridanie nového by ho priradilo len tej zvolenej — nesúlad,
 * ktorý pri dvoch prevádzkach mätie.
 */
export async function getAdminScope(): Promise<AdminScope> {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data } = await supabase
    .from('locations')
    .select('id, name')
    .eq('active', true)
    .order('created_at');

  const locations = data ?? [];
  const wanted = cookieStore.get(LOCATION_COOKIE)?.value;
  const current = locations.find((l) => l.id === wanted) ?? locations[0] ?? null;

  return {
    supabase,
    locations,
    locationId: current?.id ?? null,
    locationName: current?.name ?? null,
  };
}
