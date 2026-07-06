import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';

export const KIOSK_COOKIE = 'kiosk_token';
const KIOSK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 rok; re-pair kedykoľvek

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

export type KioskSession = {
  kioskId: string;
  tenantId: string;
  locationId: string;
  kioskName: string;
};

/**
 * Overí device token z httpOnly cookie proti SHA-256 hashu v DB.
 * Vracia tenant/location scoping pre všetky kiosk operácie — klient
 * nikdy neposiela tenant_id sám.
 */
export async function getKioskSession(): Promise<KioskSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(KIOSK_COOKIE)?.value;
  if (!token) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('kiosk_devices')
    .select('id, tenant_id, location_id, name')
    .eq('device_token_hash', sha256Hex(token))
    .eq('active', true)
    .maybeSingle();

  if (!data) return null;

  return {
    kioskId: data.id,
    tenantId: data.tenant_id,
    locationId: data.location_id,
    kioskName: data.name,
  };
}
