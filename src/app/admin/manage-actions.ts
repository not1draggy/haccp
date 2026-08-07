'use server';

import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { LOCATION_COOKIE } from '@/lib/admin/constants';

// Všetky mutácie bežia pod RLS klientom prihláseného admina —
// policies pustia zápis len tenant_adminovi v rámci jeho tenanta.

/**
 * Tenant + práve zvolená prevádzka. Prevádzka sa drží v cookie; hodnota sa
 * VŽDY overuje proti DB, takže podvrhnuté id z prehliadača nič neotvorí —
 * RLS aj tak vráti len prevádzky vlastného tenanta.
 */
async function getScope() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const [{ data: tenant }, { data: locations }] = await Promise.all([
    supabase.from('tenants').select('id').maybeSingle(),
    supabase.from('locations').select('id').eq('active', true).order('created_at'),
  ]);

  const wanted = cookieStore.get(LOCATION_COOKIE)?.value;
  const valid = (locations ?? []).find((l) => l.id === wanted);
  const locationId = valid?.id ?? locations?.[0]?.id ?? null;

  return { supabase, tenantId: tenant?.id ?? null, locationId };
}

function back(path: string, msg?: string): never {
  redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
}

/**
 * Párovací kód tabletu. Vynechané sú znaky, ktoré si personál pri prepisovaní
 * z papiera mýli (0/O, 1/I/L) — kód sa diktuje cez kuchyňu, nie kopíruje.
 */
function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/** Kód musí byť unikátny naprieč platformou — tablet podľa neho pozná prevádzku. */
async function generateUniquePairingCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generatePairingCode();
    const { data } = await supabase
      .from('kiosk_devices')
      .select('id')
      .eq('pairing_code', code)
      .maybeSingle();
    if (!data) return code;
  }
  // Po desiatich kolíziách je niečo zásadne zle; radšej zlyhať nahlas.
  throw new Error('Nepodarilo sa vygenerovať voľný párovací kód.');
}

// ---------------------------------------------------------------- Prevádzky

export async function switchLocation(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('locationId'));
  if (!id.success) back('/admin');

  const cookieStore = await cookies();
  cookieStore.set(LOCATION_COOKIE, id.data, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/admin', 'layout');
  back('/admin');
}

/**
 * Nová prevádzka vrátane vlastného tabletu. Kód sa generuje hneď, lebo
 * prevádzka bez tabletu nemá ako merať a admin by musel robiť druhý krok,
 * na ktorý sa ľahko zabudne.
 */
export async function createLocation(formData: FormData) {
  const name = z.string().trim().min(1).max(80).safeParse(formData.get('name'));
  if (!name.success) back('/admin/locations', 'Zadaj názov prevádzky.');

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/locations', 'Účet nemá priradenú prevádzku.');

  const { data: location, error } = await supabase
    .from('locations')
    .insert({ tenant_id: tenantId, name: name.data })
    .select('id')
    .single();
  if (error || !location) back('/admin/locations', 'Uloženie zlyhalo.');

  let code: string;
  try {
    code = await generateUniquePairingCode(supabase);
  } catch {
    back(
      '/admin/locations',
      'Prevádzka vytvorená, ale kód sa nepodarilo vygenerovať — pridaj tablet ručne v sekcii Kiosky.',
    );
  }

  const { error: kioskError } = await supabase.from('kiosk_devices').insert({
    tenant_id: tenantId,
    location_id: location.id,
    name: `Tablet — ${name.data}`,
    pairing_code: code,
  });

  revalidatePath('/admin/locations');

  if (kioskError) {
    back(
      '/admin/locations',
      'Prevádzka vytvorená, ale tablet nie — pridaj ho v sekcii Kiosky.',
    );
  }

  back('/admin/locations', `Prevádzka „${name.data}" vytvorená. Kód tabletu: ${code}`);
}

/** Premenovanie firmy. Zobrazuje sa v hlavičke aj v podkladoch pre kontrolu. */
export async function renameTenant(formData: FormData) {
  const name = z.string().trim().min(1).max(120).safeParse(formData.get('name'));
  if (!name.success) back('/admin/locations', 'Zadaj názov firmy.');

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/locations', 'Účet nemá priradenú prevádzku.');

  const { error } = await supabase
    .from('tenants')
    .update({ name: name.data })
    .eq('id', tenantId);
  if (error) back('/admin/locations', 'Premenovanie zlyhalo.');

  revalidatePath('/admin', 'layout');
  back('/admin/locations', 'Názov firmy zmenený.');
}

export async function toggleLocation(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const active = formData.get('active') === 'true';
  if (!id.success) back('/admin/locations');

  const { supabase } = await getScope();
  await supabase.from('locations').update({ active }).eq('id', id.data);
  revalidatePath('/admin/locations');
  back('/admin/locations');
}

// ---------------------------------------------------------------- Zariadenia

const deviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  deviceTypeId: z.string().uuid(),
  minC: z.union([z.coerce.number().min(-99).max(300), z.literal('')]).optional(),
  maxC: z.union([z.coerce.number().min(-99).max(300), z.literal('')]).optional(),
});

export async function createDevice(formData: FormData) {
  const parsed = deviceSchema.safeParse({
    name: formData.get('name'),
    deviceTypeId: formData.get('deviceTypeId'),
    minC: formData.get('minC') ?? '',
    maxC: formData.get('maxC') ?? '',
  });
  if (!parsed.success) back('/admin/devices', 'Vyplň názov a typ zariadenia.');

  const { supabase, tenantId, locationId } = await getScope();
  if (!tenantId || !locationId) back('/admin/devices', 'Účet nemá priradenú prevádzku.');

  const { error } = await supabase.from('devices').insert({
    tenant_id: tenantId,
    location_id: locationId,
    device_type_id: parsed.data.deviceTypeId,
    name: parsed.data.name,
    min_c: parsed.data.minC === '' ? null : parsed.data.minC,
    max_c: parsed.data.maxC === '' ? null : parsed.data.maxC,
  });
  if (error) back('/admin/devices', 'Uloženie zlyhalo.');

  revalidatePath('/admin/devices');
  back('/admin/devices');
}

export async function updateDeviceLimits(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const parsed = deviceSchema.pick({ minC: true, maxC: true }).safeParse({
    minC: formData.get('minC') ?? '',
    maxC: formData.get('maxC') ?? '',
  });
  if (!id.success || !parsed.success) back('/admin/devices', 'Neplatný limit.');

  const { supabase } = await getScope();
  const { error } = await supabase
    .from('devices')
    .update({
      min_c: parsed.data.minC === '' ? null : parsed.data.minC,
      max_c: parsed.data.maxC === '' ? null : parsed.data.maxC,
    })
    .eq('id', id.data);
  if (error) back('/admin/devices', 'Uloženie zlyhalo.');

  revalidatePath('/admin/devices');
  back('/admin/devices');
}

export async function toggleDevice(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const active = formData.get('active') === 'true';
  if (!id.success) back('/admin/devices');

  const { supabase } = await getScope();
  await supabase.from('devices').update({ active }).eq('id', id.data);
  revalidatePath('/admin/devices');
  back('/admin/devices');
}

/**
 * Hromadný import zariadení. Prevádzka s tridsiatimi chladničkami ich nebude
 * klikať po jednom. Formát riadku: názov;kód typu;min;max
 */
export async function importDevices(formData: FormData) {
  const raw = z.string().trim().min(1).max(20000).safeParse(formData.get('csv'));
  if (!raw.success) back('/admin/devices', 'Vlož riadky na import.');

  const { supabase, tenantId, locationId } = await getScope();
  if (!tenantId || !locationId) back('/admin/devices', 'Účet nemá priradenú prevádzku.');

  const { data: types } = await supabase.from('device_types').select('id, code');
  const typeByCode = new Map((types ?? []).map((t) => [t.code.toLowerCase(), t.id]));

  const rows = raw.data
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const toInsert: Record<string, unknown>[] = [];
  const problems: string[] = [];

  rows.forEach((line, i) => {
    const [name, code, min, max] = line.split(';').map((c) => c?.trim() ?? '');
    if (!name || !code) {
      problems.push(`riadok ${i + 1}: chýba názov alebo kód typu`);
      return;
    }
    const typeId = typeByCode.get(code.toLowerCase());
    if (!typeId) {
      problems.push(`riadok ${i + 1}: neznámy typ "${code}"`);
      return;
    }
    const minN = min === '' ? null : Number(min.replace(',', '.'));
    const maxN = max === '' ? null : Number(max.replace(',', '.'));
    if ((minN != null && Number.isNaN(minN)) || (maxN != null && Number.isNaN(maxN))) {
      problems.push(`riadok ${i + 1}: limit nie je číslo`);
      return;
    }
    toInsert.push({
      tenant_id: tenantId,
      location_id: locationId,
      device_type_id: typeId,
      name,
      min_c: minN,
      max_c: maxN,
      sort_order: i,
    });
  });

  // Buď prejde celý import, alebo nič — čiastočne naimportovaný zoznam
  // zariadení je horší než žiadny, lebo sa ťažko dohľadáva, čo chýba.
  if (problems.length > 0) {
    back('/admin/devices', `Import zrušený — ${problems.slice(0, 3).join('; ')}`);
  }
  if (toInsert.length === 0) back('/admin/devices', 'Nič na import.');

  const { error } = await supabase.from('devices').insert(toInsert);
  if (error) back('/admin/devices', 'Import zlyhal.');

  revalidatePath('/admin/devices');
  back('/admin/devices', `Naimportovaných ${toInsert.length} zariadení.`);
}

// ------------------------------------------------------------ Typy zariadení

export async function createDeviceType(formData: FormData) {
  const name = z.string().trim().min(1).max(60).safeParse(formData.get('name'));
  const code = z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{2,30}$/)
    .safeParse(formData.get('code'));
  if (!name.success || !code.success) {
    back('/admin/devices', 'Kód typu: malé písmená, číslice a podčiarkovník.');
  }

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/devices', 'Účet nemá priradenú prevádzku.');

  const { error } = await supabase
    .from('device_types')
    .insert({ tenant_id: tenantId, name: name.data, code: code.data });
  if (error) back('/admin/devices', 'Typ sa nepodarilo pridať (kód už existuje?).');

  revalidatePath('/admin/devices');
  back('/admin/devices', 'Typ pridaný. Limit mu nastav priamo na zariadení.');
}

// -------------------------------------------------------------- Zamestnanci

const employeeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,8}$/),
});

export async function createEmployee(formData: FormData) {
  const parsed = employeeSchema.safeParse({
    name: formData.get('name'),
    pin: formData.get('pin'),
  });
  if (!parsed.success) back('/admin/employees', 'Zadaj meno a PIN (4–8 číslic).');

  const { supabase, tenantId, locationId } = await getScope();
  if (!tenantId) back('/admin/employees', 'Účet nemá priradenú prevádzku.');

  const { data: created, error } = await supabase
    .from('memberships')
    .insert({
      tenant_id: tenantId,
      role: 'employee',
      display_name: parsed.data.name,
      pin_hash: bcrypt.hashSync(parsed.data.pin, 10),
    })
    .select('id')
    .single();
  if (error || !created) back('/admin/employees', 'Uloženie zlyhalo.');

  // Bez priradenia by sa zamestnanec neobjavil na žiadnom tablete.
  // Predvolene patrí do prevádzky, v ktorej ho admin práve zakladá.
  if (locationId) {
    await supabase.from('membership_locations').insert({
      membership_id: created.id,
      location_id: locationId,
      tenant_id: tenantId,
    });
  }

  revalidatePath('/admin/employees');
  back('/admin/employees');
}

/**
 * Prepis priradenia zamestnanca k prevádzkam. Tablet ponúka len mená
 * pracovníkov svojej prevádzky, takže toto riadi, kde sa kto vie podpísať
 * pod meranie.
 */
export async function setEmployeeLocations(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) back('/admin/employees');

  const chosen = formData
    .getAll('locationIds')
    .map((v) => z.string().uuid().safeParse(v))
    .filter((r) => r.success)
    .map((r) => (r as { data: string }).data);

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/employees', 'Účet nemá priradenú prevádzku.');

  // Overíme, že ide o prevádzky vlastnej firmy — RLS by cudzí zápis aj tak
  // odmietla, ale takto vrátime zrozumiteľnú hlášku namiesto chyby.
  const { data: own } = await supabase.from('locations').select('id');
  const allowed = new Set((own ?? []).map((l) => l.id));
  const valid = chosen.filter((c) => allowed.has(c));

  await supabase.from('membership_locations').delete().eq('membership_id', id.data);

  if (valid.length > 0) {
    const { error } = await supabase.from('membership_locations').insert(
      valid.map((locId) => ({
        membership_id: id.data,
        location_id: locId,
        tenant_id: tenantId,
      })),
    );
    if (error) back('/admin/employees', 'Priradenie zlyhalo.');
  }

  revalidatePath('/admin/employees');
  back(
    '/admin/employees',
    valid.length === 0
      ? 'Zamestnanec nie je priradený k žiadnej prevádzke — na tablete sa neobjaví.'
      : 'Priradenie uložené.',
  );
}

export async function resetEmployeePin(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const pin = z.string().regex(/^\d{4,8}$/).safeParse(formData.get('pin'));
  if (!id.success || !pin.success) back('/admin/employees', 'PIN musí mať 4–8 číslic.');

  const { supabase } = await getScope();
  const { error } = await supabase
    .from('memberships')
    .update({ pin_hash: bcrypt.hashSync(pin.data, 10) })
    .eq('id', id.data)
    .eq('role', 'employee');
  if (error) back('/admin/employees', 'Uloženie zlyhalo.');

  // Nový PIN musí účet zároveň odomknúť, inak by zamestnanec čakal na
  // vypršanie okna aj napriek zmene.
  await supabase.rpc('pin_clear_attempts', { p_membership: id.data });

  revalidatePath('/admin/employees');
  back('/admin/employees', 'PIN zmenený a účet odomknutý.');
}

export async function toggleEmployee(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const active = formData.get('active') === 'true';
  if (!id.success) back('/admin/employees');

  const { supabase } = await getScope();
  await supabase
    .from('memberships')
    .update({ active })
    .eq('id', id.data)
    .eq('role', 'employee');
  revalidatePath('/admin/employees');
  back('/admin/employees');
}

// ------------------------------------------------------------------ Rozvrhy

export async function createSchedule(formData: FormData) {
  const deviceId = z.string().uuid().safeParse(formData.get('deviceId'));
  const dueTime = z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .safeParse(formData.get('dueTime'));
  const tolerance = z.coerce.number().int().min(5).max(720).safeParse(formData.get('toleranceMin'));
  if (!deviceId.success || !dueTime.success || !tolerance.success) {
    back('/admin/schedules', 'Vyplň zariadenie, čas a toleranciu (5–720 min).');
  }

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/schedules', 'Účet nemá priradenú prevádzku.');

  const { error } = await supabase.from('schedules').insert({
    tenant_id: tenantId,
    device_id: deviceId.data,
    due_time: dueTime.data,
    tolerance_min: tolerance.data,
  });
  if (error) back('/admin/schedules', 'Uloženie zlyhalo.');

  revalidatePath('/admin/schedules');
  back('/admin/schedules');
}

export async function toggleSchedule(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const active = formData.get('active') === 'true';
  if (!id.success) back('/admin/schedules');

  const { supabase } = await getScope();
  await supabase.from('schedules').update({ active }).eq('id', id.data);
  revalidatePath('/admin/schedules');
  back('/admin/schedules');
}

// ------------------------------------------------- Nápravné opatrenia

const correctiveSchema = z.object({
  measurementId: z.string().uuid(),
  action: z.string().trim().min(1).max(2000),
});

export async function addCorrectiveAction(formData: FormData) {
  const parsed = correctiveSchema.safeParse({
    measurementId: formData.get('measurementId'),
    action: formData.get('action'),
  });
  if (!parsed.success) back('/admin', 'Popíš vykonané opatrenie.');

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin', 'Účet nemá priradenú prevádzku.');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('corrective_actions').insert({
    tenant_id: tenantId,
    measurement_id: parsed.data.measurementId,
    author_user_id: user?.id ?? null,
    action: parsed.data.action,
  });
  if (error) back('/admin', 'Uloženie opatrenia zlyhalo.');

  revalidatePath('/admin');
  back('/admin');
}

// --------------------------------------------------------------- Pozvánky

const INVITE_VALID_DAYS = 7;

/**
 * Pozvanie ďalšieho admina. Token sa vracia jednorazovo v URL a v DB je len
 * jeho SHA-256 hash — rovnaký princíp ako device token kiosku, takže únik
 * databázy neumožní prevzatie účtu.
 */
export async function inviteAdmin(formData: FormData) {
  const email = z.string().trim().email().safeParse(formData.get('email'));
  const name = z.string().trim().min(1).max(80).safeParse(formData.get('displayName'));
  if (!email.success || !name.success) back('/admin/team', 'Zadaj meno a platný email.');

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/team', 'Účet nemá priradenú prevádzku.');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from('invitations').insert({
    tenant_id: tenantId,
    email: email.data.toLowerCase(),
    display_name: name.data,
    token_hash: createHash('sha256').update(token).digest('hex'),
    invited_by: user?.id ?? null,
    expires_at: expires.toISOString(),
  });
  if (error) back('/admin/team', 'Pozvánku sa nepodarilo vytvoriť.');

  revalidatePath('/admin/team');
  // Odoslanie emailu zatiaľ nie je zapojené, preto sa odkaz ukáže adminovi,
  // aby ho poslal sám. Token sa už nikdy nezobrazí.
  back('/admin/team', `token:${token}`);
}

export async function revokeInvitation(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) back('/admin/team');

  const { supabase } = await getScope();
  // Zneplatnenie = posunutie expirácie do minulosti; záznam zostáva
  // v auditnej stope.
  await supabase
    .from('invitations')
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', id.data)
    .is('accepted_at', null);

  revalidatePath('/admin/team');
  back('/admin/team', 'Pozvánka zneplatnená.');
}

// ------------------------------------------------------------------ Kiosky

export async function createKiosk(formData: FormData) {
  const name = z.string().trim().min(1).max(80).safeParse(formData.get('name'));
  if (!name.success) back('/admin/kiosks', 'Zadaj názov kiosku.');

  // Vlastný kód je voliteľný — prevádzky si ich radi volia podľa pobočky.
  const rawCode = String(formData.get('pairingCode') ?? '').trim().toUpperCase();
  let code = '';
  if (rawCode.length > 0) {
    const parsedCode = z
      .string()
      .regex(/^[A-Z0-9]{4,12}$/)
      .safeParse(rawCode);
    if (!parsedCode.success) {
      back('/admin/kiosks', 'Kód môže mať 4–12 veľkých písmen a číslic.');
    }
    code = parsedCode.data;
  }

  const { supabase, tenantId, locationId } = await getScope();
  if (!tenantId || !locationId) back('/admin/kiosks', 'Účet nemá priradenú prevádzku.');

  if (code === '') {
    try {
      code = await generateUniquePairingCode(supabase);
    } catch {
      back('/admin/kiosks', 'Kód sa nepodarilo vygenerovať, skús znova.');
    }
  }

  const { error } = await supabase.from('kiosk_devices').insert({
    tenant_id: tenantId,
    location_id: locationId,
    name: name.data,
    pairing_code: code,
  });
  // Kód je unikátny naprieč celou platformou — inak by tablet nevedel,
  // do ktorej prevádzky patrí.
  if (error?.code === '23505') {
    back('/admin/kiosks', `Kód ${code} je už použitý, zvoľ iný.`);
  }
  if (error) back('/admin/kiosks', 'Uloženie zlyhalo.');

  revalidatePath('/admin/kiosks');
  back('/admin/kiosks');
}

export async function unpairKiosk(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) back('/admin/kiosks');

  const { supabase } = await getScope();
  await supabase
    .from('kiosk_devices')
    .update({ device_token_hash: null, paired_at: null })
    .eq('id', id.data);
  revalidatePath('/admin/kiosks');
  back('/admin/kiosks', 'Tablet odpojený — spáruje sa znova kódom.');
}

export async function toggleKiosk(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  const active = formData.get('active') === 'true';
  if (!id.success) back('/admin/kiosks');

  const { supabase } = await getScope();
  await supabase.from('kiosk_devices').update({ active }).eq('id', id.data);
  revalidatePath('/admin/kiosks');
  back('/admin/kiosks');
}
