import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from './actions';

const NAV = [
  { href: '/admin', label: 'Prehľad' },
  { href: '/admin/devices', label: 'Zariadenia' },
  { href: '/admin/employees', label: 'Zamestnanci' },
  { href: '/admin/kiosks', label: 'Kiosky' },
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

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .maybeSingle();

  // Bez tenanta = JWT claims hook nie je aktivovaný alebo chýba membership.
  const tenantName = tenant?.name ?? '⚠ chýba tenant (skontroluj JWT hook)';

  return (
    <div className="min-h-screen">
      <header className="border-b border-steel/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-bold">HACCP</span>
            <span className="text-sm text-steel/60">{tenantName}</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
            >
              Odhlásiť sa
            </button>
          </form>
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
