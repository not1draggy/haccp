'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const acceptSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(8).max(200),
});

/**
 * Prijatie pozvánky. Pozvaný spravidla ešte nemá účet, takže registrácia
 * a naviazanie na prevádzku prebehnú naraz — inak by sa musel najprv
 * zaregistrovať a až potom znova otvárať odkaz.
 *
 * Lookup ide cez service role: nezaregistrovaný používateľ nemá session,
 * takže by ho RLS nepustila ani k vlastnej pozvánke. Autorizáciu tu robí
 * samotný token (v DB len jeho SHA-256).
 */
export async function acceptInvitation(formData: FormData) {
  const parsed = acceptSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/invite/${formData.get('token') ?? ''}?error=weak`);
  }

  const admin = createServiceClient();
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');

  const { data: invite } = await admin
    .from('invitations')
    .select('id, tenant_id, email, display_name, expires_at, accepted_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    redirect(`/invite/${parsed.data.token}?error=invalid`);
  }

  // Účet vytvárame cez service role, aby bol email rovno potvrdený —
  // pozvánku už overil token a čakanie na potvrdzovací email by len
  // pridalo krok, v ktorom sa dá zaseknúť.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invite.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  let userId = created?.user?.id ?? null;

  if (createError) {
    // Účet s týmto emailom už existuje — pozvánku naviažeme naň.
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email?.toLowerCase() === invite.email)?.id ?? null;
    if (!userId) {
      redirect(`/invite/${parsed.data.token}?error=account`);
    }
    await admin.auth.admin.updateUserById(userId, { password: parsed.data.password });
  }

  const { error: membershipError } = await admin.from('memberships').insert({
    tenant_id: invite.tenant_id,
    user_id: userId,
    role: 'tenant_admin',
    display_name: invite.display_name,
  });

  // Duplicitné členstvo (23505) znamená, že používateľ už k prevádzke patrí —
  // pozvánku aj tak uzavrieme, výsledok je rovnaký.
  if (membershipError && membershipError.code !== '23505') {
    redirect(`/invite/${parsed.data.token}?error=membership`);
  }

  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', invite.id);

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({
    email: invite.email,
    password: parsed.data.password,
  });

  redirect('/admin');
}
