'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limit';

const signUpSchema = z.object({
  company: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

function fail(code: string): never {
  redirect(`/registracia?error=${code}`);
}

/**
 * Registrácia novej firmy. Vznikne naraz účet, firma, prvá prevádzka, jej
 * tablet aj členstvo admina — nový zákazník sa po odoslaní rovnou dostane do
 * administrácie s kódom tabletu, nie do prázdneho účtu bez prevádzky.
 *
 * Účet zakladá service role s potvrdeným emailom: čakanie na potvrdzovací
 * mail je krok, v ktorom sa onboarding najčastejšie zasekne, a prístup k
 * dátam aj tak stráži RLS podľa členstva.
 */
export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    company: formData.get('company'),
    location: formData.get('location'),
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) fail('invalid');

  // Verejný endpoint bez session, ktorý zakladá auth účet aj firmu — bez
  // limitu sa dá skriptom vyrobiť ľubovoľný počet firiem.
  const limit = await checkRateLimit('signup');
  if (limit.lockedSeconds > 0) fail('limit');

  const { company, location, displayName, email, password } = parsed.data;
  const admin = createServiceClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    // Existujúci email neriešime prevzatím účtu — to by z registračného
    // formulára spravilo nástroj na prepísanie cudzieho hesla.
    await limit.record(false);
    fail('email');
  }

  const { data: rows, error: rpcError } = await admin.rpc('register_tenant', {
    p_user_id: created.user.id,
    p_company_name: company,
    p_location_name: location,
    p_admin_name: displayName,
  });

  const result = (rows as { pairing_code: string }[] | null)?.[0];

  if (rpcError || !result) {
    // Firma nevznikla (funkcia je jedna transakcia), takže po čerstvom účte
    // ostal len prázdny používateľ — zmažeme ho, aby sa dal email použiť znova.
    await admin.auth.admin.deleteUser(created.user.id);
    await limit.record(false);
    fail('tenant');
  }

  await limit.record(true);

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });
  if (signInError) redirect('/login');

  redirect(`/admin/locations?msg=${encodeURIComponent(
    `Firma „${company}" je založená. Kód tabletu pre prevádzku „${location}": ${result.pairing_code}`,
  )}`);
}
