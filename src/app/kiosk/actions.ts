'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  generateKioskToken,
  getKioskSession,
  setKioskCookie,
  sha256Hex,
} from '@/lib/kiosk/session';
import { createServiceClient } from '@/lib/supabase/service';

// Všetky kiosk actions bežia so service role — tenant/location scoping
// sa preto VŽDY odvodzuje z device tokenu (getKioskSession), nikdy z klienta.

const pairSchema = z.object({
  code: z.string().trim().min(4).max(32),
});

export async function pairKiosk(input: { code: string }) {
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: 'Zadaj platný párovací kód.' };
  }

  const supabase = createServiceClient();
  const { data: kiosk } = await supabase
    .from('kiosk_devices')
    .select('id')
    .eq('pairing_code', parsed.data.code.toUpperCase())
    .eq('active', true)
    .maybeSingle();

  if (!kiosk) {
    return { ok: false as const, error: 'Neznámy párovací kód.' };
  }

  // Re-pair je povolený: nový token zneplatní prípadný starý tablet.
  const token = generateKioskToken();
  const { error } = await supabase
    .from('kiosk_devices')
    .update({
      device_token_hash: sha256Hex(token),
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', kiosk.id);

  if (error) {
    return { ok: false as const, error: 'Párovanie zlyhalo, skús znova.' };
  }

  await setKioskCookie(token);
  return { ok: true as const };
}

const pinSchema = z.object({
  membershipId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
});

async function verifyEmployeePin(
  tenantId: string,
  membershipId: string,
  pin: string,
) {
  const supabase = createServiceClient();
  const { data: member } = await supabase
    .from('memberships')
    .select('id, display_name, pin_hash')
    .eq('id', membershipId)
    .eq('tenant_id', tenantId)
    .eq('role', 'employee')
    .eq('active', true)
    .maybeSingle();

  if (!member?.pin_hash) return null;
  const valid = await bcrypt.compare(pin, member.pin_hash);
  return valid ? member : null;
}

export async function verifyPin(input: { membershipId: string; pin: string }) {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: 'Zadaj PIN (4–8 číslic).' };
  }

  const session = await getKioskSession();
  if (!session) {
    return { ok: false as const, error: 'Kiosk nie je spárovaný.' };
  }

  const member = await verifyEmployeePin(
    session.tenantId,
    parsed.data.membershipId,
    parsed.data.pin,
  );
  if (!member) {
    return { ok: false as const, error: 'Nesprávny PIN.' };
  }
  return { ok: true as const };
}

const measurementSchema = pinSchema.extend({
  deviceId: z.string().uuid(),
  valueC: z.number().min(-99).max(300),
});

export type SubmitResult =
  | {
      ok: true;
      status: 'ok' | 'alarm';
      minC: number | null;
      maxC: number | null;
    }
  | { ok: false; error: string };

export async function submitMeasurement(input: {
  membershipId: string;
  pin: string;
  deviceId: string;
  valueC: number;
}): Promise<SubmitResult> {
  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Neplatné údaje merania.' };
  }

  const session = await getKioskSession();
  if (!session) {
    return { ok: false, error: 'Kiosk nie je spárovaný.' };
  }

  // PIN sa overuje aj pri zápise — autorizácia sa nespolieha na klientsky stav.
  const member = await verifyEmployeePin(
    session.tenantId,
    parsed.data.membershipId,
    parsed.data.pin,
  );
  if (!member) {
    return { ok: false, error: 'Nesprávny PIN.' };
  }

  const supabase = createServiceClient();

  const { data: device } = await supabase
    .from('devices')
    .select('id, device_type_id')
    .eq('id', parsed.data.deviceId)
    .eq('tenant_id', session.tenantId)
    .eq('location_id', session.locationId)
    .eq('active', true)
    .maybeSingle();

  if (!device) {
    return { ok: false, error: 'Neznáme zariadenie.' };
  }

  // Aktuálne platná verzia pravidla pre daný typ zariadenia.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: rule } = await supabase
    .from('rules')
    .select('id, min_c, max_c')
    .eq('device_type_id', device.device_type_id)
    .lte('valid_from', todayIso)
    .or(`valid_to.is.null,valid_to.gt.${todayIso}`)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  const minC = rule?.min_c != null ? Number(rule.min_c) : null;
  const maxC = rule?.max_c != null ? Number(rule.max_c) : null;
  const outOfRange =
    (minC != null && parsed.data.valueC < minC) ||
    (maxC != null && parsed.data.valueC > maxC);
  const status: 'ok' | 'alarm' = outOfRange ? 'alarm' : 'ok';

  const { error } = await supabase.from('measurements').insert({
    tenant_id: session.tenantId,
    location_id: session.locationId,
    device_id: device.id,
    membership_id: member.id,
    kiosk_device_id: session.kioskId,
    rule_id: rule?.id ?? null,
    value_c: parsed.data.valueC,
    status,
  });

  if (error) {
    return { ok: false, error: 'Zápis merania zlyhal, skús znova.' };
  }

  await supabase
    .from('kiosk_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', session.kioskId);

  return { ok: true, status, minC, maxC };
}
