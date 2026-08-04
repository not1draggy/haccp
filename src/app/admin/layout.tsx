import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from './actions';
import { switchLocation } from './manage-actions';
import { LOCATION_COOKIE } from '@/lib/admin/constants';

const NAV = [
  { href: '/admin', label: 'Prehľad' },
  { href: '/admin/history', label: 'História' },
  { href: '/admin/devices', label: 'Zariadenia' },
  { href: '/admin/schedules', label: 'Rozvrhy' },
  { href: '/admin/employees', label: 'Zamestnanci' },
  { href: '/admin/kiosks', label: 'Kiosky' },
  { href: '/admin/locations', label: 'Prevádzky' },
  { href: '/admin/team', label: 'Tím' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: tenant }, { data: locations }] = await Promise.all([
    supabase.from('tenants').select('name').maybeSingle(),
    supabase.from('locations').select('id, name').eq('active', true).order('created_at'),
  ]);

  // Tenant sa rieši dvojstupňovo (JWT claim → fallback lookup membership),
  // takže prázdny výsledok znamená, že účet nemá aktívne členstvo v žiadnom
  // tenantovi — nie zlyhanie JWT hooku.
  const tenantName = tenant?.name ?? '⚠ účet nemá priradenú prevádzku';

  const cookieStore = await cookies();
  const wanted = cookieStore.get(LOCATION_COOKIE)?.value;
  const activeLocation =
    (locations ?? []).find((l) => l.id === wanted)?.id ?? locations?.[0]?.id ?? '';

  return (
    <div className="min-h-screen">
      <header className="border-b border-steel/10 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-bold">HACCP</span>
            <span className="text-sm text-steel/60">{tenantName}</span>
          </div>
          <div className="flex items-center gap-2">
            {(locations?.length ?? 0) > 1 && (
              <form action={switchLocation}>
                <label className="sr-only" htmlFor="locationId">
                  Prevádzka
                </label>
                <select
                  id="locationId"
                  name="locationId"
                  defaultValue={activeLocation}
                  className="rounded-lg border border-steel/20 bg-white px-3 py-1.5 text-sm"
                >
                  {(locations ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="ml-2 rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                >
                  Prepnúť
                </button>
              </form>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
              >
                Odhlásiť sa
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-steel/70 transition-colors duration-150 hover:bg-frost hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
