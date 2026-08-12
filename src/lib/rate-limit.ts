import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Limit pokusov pre verejné endpointy, ktoré nemajú za sebou session:
 * párovanie tabletu a registrácia firmy. Počítadlo je v DB, pretože
 * serverless inštancie nezdieľajú pamäť.
 *
 * Ukladá sa iba SHA-256 hash IP, nie IP samotná — na počítanie pokusov to
 * stačí a systém sa tým nestáva evidenciou toho, kto sa odkiaľ pripájal.
 */
export type RateLimitScope = 'pairing' | 'signup';

/**
 * Bez proxy hlavičky (lokálny beh, priame volanie) padáme na spoločný kľúč.
 * Limit tým platí aj vtedy — radšej spoločný strop než žiadny.
 */
async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    'unknown';
  return createHash('sha256').update(ip).digest('hex');
}

export type RateLimitHandle = {
  /** Sekundy do odomknutia; 0 = volanie môže pokračovať. */
  lockedSeconds: number;
  record: (success: boolean) => Promise<void>;
};

export async function checkRateLimit(scope: RateLimitScope): Promise<RateLimitHandle> {
  const supabase = createServiceClient();
  const ipHash = await clientIpHash();

  const { data } = await supabase.rpc('rate_limit_locked_seconds', {
    p_scope: scope,
    p_ip_hash: ipHash,
  });

  return {
    lockedSeconds: typeof data === 'number' ? data : 0,
    record: async (success: boolean) => {
      await supabase.rpc('rate_limit_record_attempt', {
        p_scope: scope,
        p_ip_hash: ipHash,
        p_success: success,
      });
    },
  };
}

export function lockedMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
