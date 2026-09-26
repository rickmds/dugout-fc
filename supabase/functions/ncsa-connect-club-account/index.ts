import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ncsaLogin } from '../_shared/ncsaAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A club's own NCSA admin-level login — reaches the Administrative Area
// (fines, the club's full team/coach roster) that a plain coach login
// can't. Distinct from ncsa-connect-account, which saves one coach's
// personal login for the on-demand opposing-coach lookup. One admin
// credential per club, connected once by an org_admin; used server-side
// by ncsa-sync-club-coaches and the fines sync rather than depending on
// any single coach's account staying connected.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  const callerId = userData.user.id;

  let body: { club_id?: string; action?: string; ncsa_username?: string; ncsa_password?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const { club_id } = body;
  if (!club_id) {
    return new Response(JSON.stringify({ error: 'club_id required' }), { status: 400, headers: CORS });
  }

  // Same admin-authorization shape used elsewhere in this codebase
  // (is_club_admin(cid)): app_admin, org_admin at their home club, or a
  // club_admins row for this club.
  const [{ data: profile }, { data: adminRow }] = await Promise.all([
    supabase.from('profiles').select('role, club_id').eq('id', callerId).single(),
    supabase.from('club_admins').select('id').eq('club_id', club_id).eq('profile_id', callerId).maybeSingle(),
  ]);
  const isClubAdmin = !!adminRow
    || profile?.role === 'app_admin'
    || (profile?.role === 'org_admin' && profile?.club_id === club_id);
  if (!isClubAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS });

  if (body.action === 'disconnect') {
    const { error } = await supabase.rpc('ncsa_delete_club_credential', { p_club_id: club_id });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ connected: false }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const { ncsa_username, ncsa_password } = body;
  if (!ncsa_username || !ncsa_password) {
    return new Response(JSON.stringify({ error: 'ncsa_username and ncsa_password required' }), { status: 400, headers: CORS });
  }

  // Verify the credential actually works BEFORE saving anything — a wrong
  // password must never get persisted, since the coach-roster and fines
  // syncs can't distinguish "bad saved password" from "NCSA is down".
  const session = await ncsaLogin(ncsa_username, ncsa_password);
  if (!session) {
    return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401, headers: CORS });
  }

  const { error: saveErr } = await supabase.rpc('ncsa_save_club_credential', {
    p_club_id: club_id, p_username: ncsa_username, p_password: ncsa_password,
  });
  if (saveErr) {
    return new Response(JSON.stringify({ error: saveErr.message }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ connected: true, username: ncsa_username }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
