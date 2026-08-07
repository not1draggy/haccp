import { getAdminScope } from '@/lib/admin/scope';
import {
  createEmployee,
  resetEmployeePin,
  setEmployeeLocations,
  toggleEmployee,
} from '../manage-actions';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { supabase, locations, locationName } = await getAdminScope();

  const { data: rows } = await supabase
    .from('memberships')
    .select('id, display_name, active, created_at, membership_locations(location_id)')
    .eq('role', 'employee')
    .order('display_name');

  type EmployeeRow = {
    id: string;
    display_name: string;
    active: boolean;
    created_at: string;
    membership_locations: { location_id: string }[] | null;
  };

  const employees = (rows ?? []) as unknown as EmployeeRow[];
  const locationName_ = locationName;

  return (
    <div className="space-y-6">
      {msg && (
        <p className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">{msg}</p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pridať zamestnanca</h2>
        <form action={createEmployee} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input
            name="name"
            required
            placeholder="Meno (napr. Peter Kuchár)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <input
            name="pin"
            required
            inputMode="numeric"
            pattern="\d{4,8}"
            placeholder="PIN (4–8 číslic)"
            className="rounded-lg border border-steel/20 px-3 py-2 focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-steel px-5 py-2 font-semibold text-white hover:bg-ink"
          >
            Pridať
          </button>
        </form>
        <p className="mt-2 text-xs text-steel/50">
          PIN slúži na identifikáciu pracovníka na kiosku (audit záznam) — ukladá sa iba jeho hash.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Zamestnanci</h2>
        {employees.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel/50">
            Zatiaľ žiadni zamestnanci — pridaj prvého vyššie.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-steel/5">
            {employees.map((e) => (
              <div
                key={e.id}
                className={`flex flex-wrap items-center gap-3 py-3 ${e.active ? '' : 'opacity-50'}`}
              >
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{e.display_name}</p>
                  <p className="text-sm text-steel/50">
                    {(() => {
                      const ids = new Set(
                        (e.membership_locations ?? []).map((l) => l.location_id),
                      );
                      const names = locations
                        .filter((l) => ids.has(l.id))
                        .map((l) => l.name);
                      return names.length > 0
                        ? names.join(', ')
                        : '⚠ bez prevádzky — na tablete sa neobjaví';
                    })()}
                  </p>
                </div>
                <form action={resetEmployeePin} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input
                    name="pin"
                    inputMode="numeric"
                    pattern="\d{4,8}"
                    placeholder="Nový PIN"
                    className="w-28 rounded-lg border border-steel/20 px-2 py-1.5 text-sm focus:border-steel focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                  >
                    Zmeniť PIN
                  </button>
                </form>
                {locations.length > 1 && (
                  <form action={setEmployeeLocations} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    {locations.map((l) => {
                      const assigned = (e.membership_locations ?? []).some(
                        (ml) => ml.location_id === l.id,
                      );
                      return (
                        <label key={l.id} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            name="locationIds"
                            value={l.id}
                            defaultChecked={assigned}
                          />
                          {l.name}
                        </label>
                      );
                    })}
                    <button
                      type="submit"
                      className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                    >
                      Uložiť prevádzky
                    </button>
                  </form>
                )}
                <form action={toggleEmployee}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="active" value={String(!e.active)} />
                  <button
                    type="submit"
                    className="rounded-lg border border-steel/20 px-3 py-1.5 text-sm hover:bg-frost"
                  >
                    {e.active ? 'Deaktivovať' : 'Aktivovať'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
