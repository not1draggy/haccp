import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service role klient — obchádza RLS. Výhradne pre kiosk server actions,
 * ktoré si tenant/location scoping vynucujú explicitne cez device token.
 * NIKDY neimportovať z klientskeho kódu ('server-only' to vynúti).
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
