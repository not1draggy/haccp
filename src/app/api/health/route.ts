import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * Health check pre monitoring a pre kontrolu po nasadení.
 *
 * Overuje aj spojenie s databázou, nielen to, že proces beží — appka bez DB
 * vyzerá zvonku živá, ale kuchyňa cez ňu nezapíše ani jedno meranie.
 *
 * Odpoveď je zámerne bez detailov o chybe: endpoint je verejný a hlásenie
 * typu „relation ... does not exist" je návod pre útočníka. Podrobnosť
 * zostáva v logu servera.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = { app: 'ok', database: 'error' };

  const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missingEnv = requiredEnv.filter((k) => !process.env[k]);
  checks.config = missingEnv.length === 0 ? 'ok' : 'error';

  if (missingEnv.length > 0) {
    console.error('[health] chýbajúce premenné prostredia:', missingEnv.join(', '));
  } else {
    try {
      // Najlacnejší dotaz, ktorý naozaj siahne do DB. `rules` je malá,
      // globálna a nepodlieha RLS scopingu.
      const supabase = createServiceClient();
      const { error } = await supabase.from('rules').select('id').limit(1);
      if (error) {
        console.error('[health] databáza neodpovedá:', error.message);
      } else {
        checks.database = 'ok';
      }
    } catch (e) {
      console.error('[health] databáza neodpovedá:', e);
    }
  }

  const healthy = Object.values(checks).every((v) => v === 'ok');

  return Response.json(
    { status: healthy ? 'ok' : 'degraded', checks, time: new Date().toISOString() },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
