'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  clearKioskCookie,
  generateKioskToken,
  getKioskSession,
  setKioskCookie,
  sha256Hex,
} from '@/lib/kiosk/session';
import { createServiceClient } from '@/lib/supabase/service';
import { evaluateStatus, resolveLimits } from '@/lib/haccp/limits';
import { checkRateLimit, lockedMinutes } from '@/lib/rate-limit';
import { dnesIso } from '@/lib/haccp/cas';

// Všetky kiosk actions bežia so service role — tenant/location scoping
// sa preto VŽDY odvodzuje z device tokenu (getKioskSession), nikdy z klienta.

const loginSchema = z.object({
  code: z.string().trim().min(4).max(32),
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

// Kód aj PIN sú jediná prekážka medzi cudzím človekom a prevádzkou, takže
// hláška nesmie prezradiť, ktorá z nich bola zlá — ani to, či taká prevádzka
// vôbec existuje. Inak by sa dal zoznam prevádzok zistiť hádaním kódov.
const NEUSPECH = 'Nesprávny kód prevádzky alebo PIN.';

/**
 * Prihlásenie tabletu do prevádzky. Nahradilo pôvodné párovanie samotným
 * kódom: to tablet spárovalo natrvalo, takže prehliadač s uloženou cookie
 * otváral kuchyňu bez akéhokoľvek overenia.
 */
export async function loginKiosk(input: { code: string; pin: string }) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: NEUSPECH };
  }

  const supabase = createServiceClient();

  const limit = await checkRateLimit('pairing');
  if (limit.lockedSeconds > 0) {
    return {
      ok: false as const,
      error: `Príliš veľa pokusov. Skús o ${lockedMinutes(limit.lockedSeconds)} min.`,
    };
  }

  const { data: kiosk } = await supabase
    .from('kiosk_devices')
    .select('id, pin_hash')
    .eq('pairing_code', parsed.data.code.toUpperCase())
    .eq('active', true)
    .maybeSingle();

  // Porovnanie prebehne aj pri neznámom kóde, aby sa prevádzky nedali
  // rozlíšiť podľa toho, ako rýchlo príde odpoveď.
  const hash = kiosk?.pin_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const pinSedi = await bcrypt.compare(parsed.data.pin, hash);

  if (!kiosk || !kiosk.pin_hash || !pinSedi) {
    await limit.record(false);
    return { ok: false as const, error: NEUSPECH };
  }

  // Nové prihlásenie zneplatní predošlú session toho istého tabletu.
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
    return { ok: false as const, error: 'Prihlásenie zlyhalo, skús znova.' };
  }

  await limit.record(true);
  await setKioskCookie(token);
  return { ok: true as const };
}

/** Odhlásenie prevádzky — token zneplatní aj na serveri, nielen v prehliadači. */
export async function logoutKiosk() {
  const session = await getKioskSession();
  if (session) {
    const supabase = createServiceClient();
    await supabase
      .from('kiosk_devices')
      .update({ device_token_hash: null, paired_at: null })
      .eq('id', session.kioskId);
  }
  await clearKioskCookie();
  return { ok: true as const };
}

const pinSchema = z.object({
  membershipId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
});

type PinCheck =
  | { ok: true; member: { id: string; display_name: string } }
  | { ok: false; error: string };

function lockoutMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `Príliš veľa nesprávnych pokusov. Skús o ${minutes} min alebo požiadaj vedúceho o nový PIN.`;
}

/**
 * Overí PIN a zároveň udržiava limit pokusov. 4-miestny PIN má len 10 000
 * kombinácií, takže bez obmedzenia je uhádnuteľný hrubou silou. Limit je
 * v DB, pretože serverless inštancie nezdieľajú pamäť.
 *
 * Filtrovanie podľa prevádzky patrí SEM, nie len do zoznamu na tablete:
 * membershipId chodí od klienta, takže bez tejto kontroly by sa tablet
 * pobočky A vedel podpísať pod meranie menom pracovníka pobočky B.
 */
async function verifyEmployeePin(
  tenantId: string,
  locationId: string,
  kioskId: string,
  membershipId: string,
  pin: string,
): Promise<PinCheck> {
  const supabase = createServiceClient();

  const { data: locked } = await supabase.rpc('pin_locked_seconds', {
    p_membership: membershipId,
    p_kiosk: kioskId,
  });

  if (typeof locked === 'number' && locked > 0) {
    return { ok: false, error: lockoutMessage(locked) };
  }

  const { data: member } = await supabase
    .from('memberships')
    .select('id, display_name, pin_hash, membership_locations!inner(location_id)')
    .eq('id', membershipId)
    .eq('tenant_id', tenantId)
    .eq('role', 'employee')
    .eq('active', true)
    .eq('membership_locations.location_id', locationId)
    .maybeSingle();

  const valid = member?.pin_hash ? await bcrypt.compare(pin, member.pin_hash) : false;

  await supabase.rpc('pin_record_attempt', {
    p_tenant: tenantId,
    p_membership: membershipId,
    p_kiosk: kioskId,
    p_success: valid,
  });

  if (!valid || !member) {
    return { ok: false, error: 'Nesprávny PIN.' };
  }

  return { ok: true, member: { id: member.id, display_name: member.display_name } };
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

  const check = await verifyEmployeePin(
    session.tenantId,
    session.locationId,
    session.kioskId,
    parsed.data.membershipId,
    parsed.data.pin,
  );

  return check.ok ? { ok: true as const } : { ok: false as const, error: check.error };
}

const measurementSchema = pinSchema.extend({
  deviceId: z.string().uuid(),
  valueC: z.number().min(-99).max(300),
  note: z.string().trim().max(500).optional(),
  /** Kľúč offline fronty — bráni duplicite pri opakovanom odoslaní. */
  clientUuid: z.string().uuid().optional(),
  /** Čas podľa tabletu; autoritatívny zostáva čas servera. */
  clientMeasuredAt: z.string().datetime().optional(),
});

export type SubmitResult =
  | {
      ok: true;
      status: 'ok' | 'alarm';
      minC: number | null;
      maxC: number | null;
      /** true = server už tento záznam mal (opakované odoslanie z fronty). */
      duplicate?: boolean;
    }
  | { ok: false; error: string };

export async function submitMeasurement(input: {
  membershipId: string;
  pin: string;
  deviceId: string;
  valueC: number;
  note?: string;
  clientUuid?: string;
  clientMeasuredAt?: string;
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
  const check = await verifyEmployeePin(
    session.tenantId,
    session.locationId,
    session.kioskId,
    parsed.data.membershipId,
    parsed.data.pin,
  );
  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  const supabase = createServiceClient();

  const { data: device } = await supabase
    .from('devices')
    .select('id, device_type_id, min_c, max_c')
    .eq('id', parsed.data.deviceId)
    .eq('tenant_id', session.tenantId)
    .eq('location_id', session.locationId)
    .eq('active', true)
    .maybeSingle();

  if (!device) {
    return { ok: false, error: 'Neznáme zariadenie.' };
  }

  // Aktuálne platná verzia pravidla pre daný typ zariadenia.
  const todayIso = dnesIso();
  const { data: rule } = await supabase
    .from('rules')
    .select('id, min_c, max_c')
    .eq('device_type_id', device.device_type_id)
    .lte('valid_from', todayIso)
    .or(`valid_to.is.null,valid_to.gte.${todayIso}`)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Limit zariadenia (nastavený adminom) má prednosť pred globálnym pravidlom.
  const { minC, maxC } = resolveLimits(device, rule);
  const status = evaluateStatus(parsed.data.valueC, { minC, maxC });

  const { error } = await supabase.from('measurements').insert({
    tenant_id: session.tenantId,
    location_id: session.locationId,
    device_id: device.id,
    membership_id: check.member.id,
    kiosk_device_id: session.kioskId,
    rule_id: rule?.id ?? null,
    value_c: parsed.data.valueC,
    status,
    note: parsed.data.note || null,
    client_uuid: parsed.data.clientUuid ?? null,
    client_measured_at: parsed.data.clientMeasuredAt ?? null,
  });

  if (error) {
    // 23505 = tento client_uuid už je zapísaný. Nastane, keď offline fronta
    // odošle meranie druhýkrát (napr. odpoveď sa stratila). Meranie v DB je,
    // takže je to úspech — nie chyba, ktorú by mal operátor riešiť.
    if (error.code === '23505') {
      return { ok: true, status, minC, maxC, duplicate: true };
    }
    return { ok: false, error: 'Zápis merania zlyhal, skús znova.' };
  }

  await supabase
    .from('kiosk_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', session.kioskId);

  return { ok: true, status, minC, maxC };
}

const skipSchema = pinSchema.extend({
  deviceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

/**
 * Preskočenie kontroly s dôvodom. Chýbajúci riadok v denníku vyzerá pri
 * kontrole ako nedbalosť; "prevádzka bola zatvorená" je legitímne vysvetlenie,
 * ktoré má byť súčasťou záznamu. Zámerne to NIE je meranie so status='skipped'
 * — meranie musí mať nameranú hodnotu.
 */
export async function skipCheck(input: {
  membershipId: string;
  pin: string;
  deviceId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Uveď dôvod preskočenia.' };
  }

  const session = await getKioskSession();
  if (!session) {
    return { ok: false, error: 'Kiosk nie je spárovaný.' };
  }

  const check = await verifyEmployeePin(
    session.tenantId,
    session.locationId,
    session.kioskId,
    parsed.data.membershipId,
    parsed.data.pin,
  );
  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  const supabase = createServiceClient();

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', parsed.data.deviceId)
    .eq('tenant_id', session.tenantId)
    .eq('location_id', session.locationId)
    .eq('active', true)
    .maybeSingle();

  if (!device) {
    return { ok: false, error: 'Neznáme zariadenie.' };
  }

  const { error } = await supabase.from('check_skips').insert({
    tenant_id: session.tenantId,
    location_id: session.locationId,
    device_id: device.id,
    membership_id: check.member.id,
    reason: parsed.data.reason,
  });

  if (error) {
    return { ok: false, error: 'Zápis zlyhal, skús znova.' };
  }

  return { ok: true };
}
