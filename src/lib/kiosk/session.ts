import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';

export const KIOSK_COOKIE = 'kiosk_token';

/**
 * Prihlásenie platí jednu zmenu. Tablet v kuchyni je zdieľané zariadenie —
 * ročná platnosť znamenala, že kto sa k nemu raz dostal, mal prevádzku
 * otvorenú natrvalo. Kuchyňa sa tak prihlási raz za smenu, nie pri každom
 * meraní: PIN pracovníka rieši podpis pod meranie, toto rieši prístup
 * k prevádzke.
 */
export const KIOSK_SESSION_HOURS = 12;
const KIOSK_COOKIE_MAX_AGE = 60 * 60 * KIOSK_SESSION_HOURS;

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateKioskToken(): string {
  return randomBytes(32).toString('hex');
}

export async function setKioskCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: KIOSK_COOKIE_MAX_AGE,
  });
}

/** Vypršala platnosť prihlásenia? Rozhoduje čas na serveri. */
export function jeSessionPlatna(pairedAt: string, teraz: Date = new Date()): boolean {
  const vek = teraz.getTime() - new Date(pairedAt).getTime();
  return vek >= 0 && vek < KIOSK_SESSION_HOURS * 60 * 60 * 1000;
}

export type KioskSession = {
  kioskId: string;
  tenantId: string;
  locationId: string;
  kioskName: string;
};

export async function clearKioskCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(KIOSK_COOKIE);
}

/**
 * Overí device token z httpOnly cookie proti SHA-256 hashu v DB.
 * Vracia tenant/location scoping pre všetky kiosk operácie — klient
 * nikdy neposiela tenant_id sám.
 *
 * Platnosť sa kontroluje na serveri, nie len cez maxAge cookie: maxAge drží
 * prehliadač a ukradnutý token by sa dal prehrať aj po jeho vypršaní.
 */
export async function getKioskSession(): Promise<KioskSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(KIOSK_COOKIE)?.value;
  if (!token) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('kiosk_devices')
    .select('id, tenant_id, location_id, name, paired_at')
    .eq('device_token_hash', sha256Hex(token))
    .eq('active', true)
    .maybeSingle();

  if (!data) return null;

  if (!data.paired_at || !jeSessionPlatna(data.paired_at)) return null;

  return {
    kioskId: data.id,
    tenantId: data.tenant_id,
    locationId: data.location_id,
    kioskName: data.name,
  };
}
