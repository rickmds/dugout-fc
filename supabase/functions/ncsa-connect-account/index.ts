import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ncsaLogin } from '../_shared/ncsaAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A coach's personal NCSA login, connected once so ncsa-opposing-coach can
// use it for on-demand lookups later. Not team-scoped — one NCSA account
// per coach, even if they coach more than one team. The password itself
// never touches public.ncsa_coach_credentials directly; ncsa_save_credential
// (SECURITY DEFINER, service_role-only) is the only path that writes it
// into Vault. See supabase/functions/_shared/ncsaAuth.ts for the login flow.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  const profileId = userData.user.id;

  let body: { action?: string; ncsa_username?: string; ncsa_password?: string } = {};
  try { body = await req.json(); } catch { /* */ }

  if (body.action === 'disconnect') {
    const { error } = await supabase.rpc('ncsa_delete_credential', { p_profile_id: profileId });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ connected: false }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const { ncsa_username, ncsa_password } = body;
  if (!ncsa_username || !ncsa_password) {
    return new Response(JSON.stringify({ error: 'ncsa_username and ncsa_password required' }), { status: 400, headers: CORS });
  }

  // Verify the credential actually works BEFORE saving anything — a wrong
  // password must never get persisted, since ncsa-opposing-coach can't
  // distinguish "bad saved password" from "NCSA is down" at lookup time.
  const session = await ncsaLogin(ncsa_username, ncsa_password);
  if (!session) {
    return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401, headers: CORS });
  }

  const { error: saveErr } = await supabase.rpc('ncsa_save_credential', {
    p_profile_id: profileId, p_username: ncsa_username, p_password: ncsa_password,
  });
  if (saveErr) {
    return new Response(JSON.stringify({ error: saveErr.message }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ connected: true, username: ncsa_username }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
