import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ncsaLogin, ncsaFetch, USER_AGENT } from '../_shared/ncsaAuth.ts';
import { parseClubDropdown, findClubCandidates, parseClubTeams } from '../_shared/ncsaClub.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLUB_TEAMS_URL = 'https://www.ncsanj.com/clubTeams.cfm';

type SB = ReturnType<typeof createClient>;

// Resolves clubs.ncsa_clubid once (matching ncsa_club_name against the
// anonymous club dropdown) and caches it — every later sync reuses the
// stored id instead of re-running the fuzzy match.
async function resolveClubId(supabase: SB, clubId: string, ncsaClubName: string | null): Promise<{ clubid: string } | { error: string; candidates?: unknown }> {
  const { data: club } = await supabase.from('clubs').select('ncsa_clubid').eq('id', clubId).single();
  const existing = (club as any)?.ncsa_clubid;
  if (existing) return { clubid: String(existing) };

  if (!ncsaClubName) return { error: 'no_ncsa_club_name' };
  const dropdownRes = await fetch(CLUB_TEAMS_URL, { headers: { 'User-Agent': USER_AGENT } });
  const clubs = parseClubDropdown(await dropdownRes.text());
  const candidates = findClubCandidates(ncsaClubName, clubs);
  if (candidates.length !== 1) return { error: 'ambiguous_club', candidates: candidates.length ? candidates : clubs };

  await supabase.from('clubs').update({ ncsa_clubid: parseInt(candidates[0].clubid, 10) }).eq('id', clubId);
  return { clubid: candidates[0].clubid };
}

async function syncClub(supabase: SB, clubId: string): Promise<{ error?: string; candidates?: unknown; synced?: number }> {
  const { data: club } = await supabase.from('clubs').select('name, ncsa_club_name').eq('id', clubId).single();
  // ncsa_club_name is only ever set by the onboarding NCSA club-picker —
  // a club that flipped the Settings toggle instead (e.g. an existing
  // club that predates that picker) never had a chance to set it. Falls
  // back to the club's own Pulse FC name, which is often identical or
  // close enough for findClubCandidates' fuzzy match to still resolve.
  const searchName = (club as any)?.ncsa_club_name ?? (club as any)?.name ?? null;
  const resolved = await resolveClubId(supabase, clubId, searchName);
  if ('error' in resolved) return resolved;

  const { data: credRows } = await supabase.rpc('ncsa_get_club_credential', { p_club_id: clubId });
  const cred = (credRows as any[])?.[0];
  if (!cred) return { error: 'not_connected' };

  const session = await ncsaLogin(cred.ncsa_username, cred.ncsa_password);
  if (!session) return { error: 'login_failed' };

  const teamsRes = await ncsaFetch(CLUB_TEAMS_URL, session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `clubid=${encodeURIComponent(resolved.clubid)}`,
  });
  const rows = parseClubTeams(await teamsRes.text());

  // One contact.cfc call per unique coach, not per team — the same
  // person often coaches (or assistant-coaches) more than one team, and
  // NCSA's contact endpoint is identical either way.
  const uniqueCoaches = new Map<string, { role: string; teamRawName: string }>();
  for (const row of rows) {
    for (const c of row.coaches) {
      if (!uniqueCoaches.has(c.coachId)) uniqueCoaches.set(c.coachId, { role: c.role, teamRawName: row.team });
    }
  }

  const contacts = await Promise.all([...uniqueCoaches.entries()].map(async ([coachId, meta]) => {
    try {
      const res = await ncsaFetch(`https://www.ncsanj.com/components/contact.cfc?method=getContactInfoJSON&contactID=${encodeURIComponent(coachId)}`, session);
      const info = await res.json();
      return { coachId, ...meta, first: info.first as string | null, last: info.last as string | null, email: (info.email as string | null)?.toLowerCase() ?? null, cell: info.cell as string | null, homephone: info.homephone as string | null };
    } catch {
      return { coachId, ...meta, first: null, last: null, email: null, cell: null, homephone: null };
    }
  }));

  const emails = contacts.map((c) => c.email).filter((e): e is string => !!e);
  const profileByEmail = new Map<string, string>();
  if (emails.length) {
    // profiles has no email column (that lives in auth.users) — resolve
    // via the admin listUsers API the same way sync-ncsa-schedule's
    // resolveParentEmails does, just in the opposite direction (email ->
    // profile id instead of profile id -> email).
    let page = 1, hasMore = true;
    const wanted = new Set(emails);
    while (hasMore && wanted.size > profileByEmail.size) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of data?.users ?? []) {
        if (u.email && wanted.has(u.email.toLowerCase())) profileByEmail.set(u.email.toLowerCase(), u.id);
      }
      hasMore = (data?.users?.length ?? 0) === 1000;
      page++;
    }
  }

  for (const c of contacts) {
    const matchedProfileId = c.email ? profileByEmail.get(c.email) ?? null : null;
    await supabase.from('ncsa_synced_coaches').upsert({
      club_id: clubId, ncsa_coach_id: c.coachId, ncsa_team_raw_name: c.teamRawName, role: c.role,
      first_name: c.first, last_name: c.last, email: c.email, cell: c.cell, home_phone: c.homephone,
      matched_profile_id: matchedProfileId, last_synced_at: new Date().toISOString(),
    }, { onConflict: 'club_id,ncsa_coach_id,ncsa_team_raw_name' });
  }

  return { synced: contacts.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: { club_id?: string } = {};
  try { body = await req.json(); } catch { /* cron calls with an empty body */ }

  // Same dedicated-secret pattern as sync-ncsa-reports — see that
  // function for why this isn't the shared service_role key or another
  // hardcoded literal.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isServiceRole = token === Deno.env.get('NCSA_REPORTS_CRON_KEY');

  if (!isServiceRole) {
    if (!body.club_id) return new Response(JSON.stringify({ error: 'club_id required' }), { status: 400, headers: CORS });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    const callerId = userData.user.id;
    const [{ data: profile }, { data: adminRow }] = await Promise.all([
      supabase.from('profiles').select('role, club_id').eq('id', callerId).single(),
      supabase.from('club_admins').select('id').eq('club_id', body.club_id).eq('profile_id', callerId).maybeSingle(),
    ]);
    const isClubAdmin = !!adminRow || (profile as any)?.role === 'app_admin' || ((profile as any)?.role === 'org_admin' && (profile as any)?.club_id === body.club_id);
    if (!isClubAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS });
  }

  let clubIds: string[];
  if (body.club_id) {
    clubIds = [body.club_id];
  } else {
    const { data: rows } = await supabase.from('club_ncsa_admin_credentials').select('club_id');
    clubIds = ((rows ?? []) as any[]).map((r) => r.club_id as string);
  }

  const results: Record<string, { error?: string; synced?: number }> = {};
  for (const clubId of clubIds) {
    try {
      results[clubId] = await syncClub(supabase, clubId);
    } catch (err) {
      results[clubId] = { error: String(err) };
    }
  }

  return new Response(JSON.stringify({ synced: clubIds.length, results }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
