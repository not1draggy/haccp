import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from './actions';

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
          <div>
            <span className="font-bold">HACCP</span>
            <span className="ml-3 text-sm text-steel/60">{tenantName}</span>
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
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
