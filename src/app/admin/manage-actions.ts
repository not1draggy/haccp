'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// Všetky mutácie bežia pod RLS klientom prihláseného admina —
// policies pustia zápis len tenant_adminovi v rámci jeho tenanta.

async function getScope() {
  const supabase = await createClient();
  const [{ data: tenant }, { data: location }] = await Promise.all([
    supabase.from('tenants').select('id').maybeSingle(),
    supabase.from('locations').select('id').limit(1).maybeSingle(),
  ]);
  return { supabase, tenantId: tenant?.id ?? null, locationId: location?.id ?? null };
}

function back(path: string, msg?: string): never {
  redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
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

  const { supabase, tenantId } = await getScope();
  if (!tenantId) back('/admin/employees', 'Účet nemá priradenú prevádzku.');

  const { error } = await supabase.from('memberships').insert({
    tenant_id: tenantId,
    role: 'employee',
    display_name: parsed.data.name,
    pin_hash: bcrypt.hashSync(parsed.data.pin, 10),
  });
  if (error) back('/admin/employees', 'Uloženie zlyhalo.');

  revalidatePath('/admin/employees');
  back('/admin/employees');
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

// ------------------------------------------------------------------ Kiosky

function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createKiosk(formData: FormData) {
  const name = z.string().trim().min(1).max(80).safeParse(formData.get('name'));
  if (!name.success) back('/admin/kiosks', 'Zadaj názov kiosku.');

  const { supabase, tenantId, locationId } = await getScope();
  if (!tenantId || !locationId) back('/admin/kiosks', 'Účet nemá priradenú prevádzku.');

  const { error } = await supabase.from('kiosk_devices').insert({
    tenant_id: tenantId,
    location_id: locationId,
    name: name.data,
    pairing_code: generatePairingCode(),
  });
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
