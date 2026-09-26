import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ncsaLogin, ncsaFetch } from '../_shared/ncsaAuth.ts';
import { parseFinesReport, parseConflictReport, parseGameListReport, parseFieldListReport, parseCautionEjectReport, type NcsaFine, type NcsaConflict, type NcsaGameRow, type NcsaField, type NcsaDisciplineRow } from '../_shared/ncsaReports.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// NCSA's own club-admin reports — more authoritative than anything this
// app could compute from the anonymous schedule scrape (they see every
// club's bookings, not just ours). See supabase/functions/_shared/
// ncsaReports.ts for the parsers, verified against real saved HTML before
// this function was written.
const REPORT_URLS = {
  fines: 'https://www.ncsanj.com/finesListAll.cfm?pmid=40&smid=191',
  overlap: 'https://www.ncsanj.com/rptGameOverlap.cfm?pmid=51&smid=144',
  gap: 'https://www.ncsanj.com/rptGameGapTime.cfm?pmid=51&smid=127',
  missingScore: 'https://www.ncsanj.com/rptGameMissingScore.cfm?pmid=51&smid=131',
  tbs: 'https://www.ncsanj.com/rptPendingTBSgames.cfm?pmid=51&smid=174',
  fieldList: 'https://www.ncsanj.com/fieldList.cfm?club&pmid=40&smid=110',
  cautionEject: 'https://www.ncsanj.com/cautionEjectRpt.cfm?pmid=41&smid=101',
};

type SB = ReturnType<typeof createClient>;

async function notifyProfiles(supabase: SB, profileIds: string[], title: string, body: string, type: string, data: Record<string, unknown>) {
  if (!profileIds.length) return;
  await supabase.functions.invoke('send-push', { body: { profile_ids: profileIds, title, body, type, data } });
}

async function notifyClubAdmins(supabase: SB, clubId: string, title: string, body: string, type: string, data: Record<string, unknown>) {
  const { data: admins } = await supabase.from('profiles').select('id').eq('club_id', clubId).in('role', ['org_admin', 'app_admin']);
  await notifyProfiles(supabase, (admins ?? []).map((a: any) => a.id as string), title, body, type, data);
}

async function notifyTeamCoaches(supabase: SB, teamId: string, title: string, body: string, type: string, data: Record<string, unknown>) {
  const { data: coaches } = await supabase.from('team_members').select('profile_id').eq('team_id', teamId).eq('role', 'coach');
  await notifyProfiles(supabase, (coaches ?? []).map((c: any) => c.profile_id as string), title, body, type, data);
}

function toConflictRow(clubId: string, kind: 'overlap' | 'gap', c: NcsaConflict) {
  return {
    club_id: clubId, kind,
    game_a_id: c.a.gameId, game_a_date: c.a.date, game_a_time: c.a.time, game_a_field: c.a.field, game_a_division: c.a.division, game_a_home: c.a.home, game_a_visitor: c.a.visitor,
    game_b_id: c.b.gameId, game_b_date: c.b.date, game_b_time: c.b.time, game_b_home: c.b.home, game_b_visitor: c.b.visitor,
    minutes: c.minutes,
  };
}

function mapSurfaceType(surface: 'turf' | 'grass' | null): string | null {
  if (surface === 'turf') return 'Artificial Turf';
  if (surface === 'grass') return 'Natural Grass';
  return null;
}

// Auto-populates the club's Fields directory from NCSA's own field
// directory (fieldList.cfm) — the club's real fields only, by
// construction. An earlier version of this inferred venues from every
// synced game's location, which necessarily also picked up every AWAY
// venue a linked team played at; this page never has that problem, since
// it's the club's own field list, not a byproduct of game data. Only
// ever creates/updates rows this sync owns (external_source='ncsa');
// never touches field_group/is_full_field/rental_cost_per_hour/etc — the
// admin's own scheduling config, set once and left alone. A row an admin
// has dismissed (ncsa_dismissed) is left alone rather than resurrected.
async function syncFields(supabase: SB, clubId: string, fields: NcsaField[]) {
  const active = fields.filter((f) => f.active);
  if (!active.length) return;

  const { data: existingRows } = await supabase
    .from('tryout_fields')
    .select('id, external_id, ncsa_dismissed')
    .eq('club_id', clubId)
    .eq('external_source', 'ncsa');
  const existingById = new Map(((existingRows ?? []) as any[]).map((r) => [r.external_id as string, r]));

  for (const f of active) {
    const existing = existingById.get(f.fieldId);
    if (existing?.ncsa_dismissed) continue;

    const payload = {
      club_id: clubId, name: f.name, surface_type: mapSurfaceType(f.surface), has_lights: f.hasLights,
      external_source: 'ncsa', external_id: f.fieldId, last_synced_at: new Date().toISOString(),
    };
    if (existing) {
      await supabase.from('tryout_fields').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('tryout_fields').insert(payload);
    }
  }
}

async function syncFines(supabase: SB, clubId: string, fines: NcsaFine[], teamByRawName: Map<string, string>) {
  const { count } = await supabase.from('ncsa_fines').select('id', { count: 'exact', head: true }).eq('club_id', clubId);
  const isFirstSync = (count ?? 0) === 0;

  for (const f of fines) {
    const teamId = teamByRawName.get(f.teamRawName) ?? null;
    const { data: existing } = await supabase.from('ncsa_fines').select('id').eq('club_id', clubId).eq('ncsa_fine_id', f.fineId).maybeSingle();
    const payload = {
      club_id: clubId, ncsa_fine_id: f.fineId, ncsa_game_id: f.gameId, team_raw_name: f.teamRawName, team_id: teamId,
      reason: f.reason, submitted_by: f.submittedBy, fine_date: f.fineDate, amount: f.amount, status: f.status,
      scraped_at: new Date().toISOString(),
    };
    if (existing) {
      await supabase.from('ncsa_fines').update(payload).eq('id', (existing as any).id);
      continue;
    }
    const { data: inserted } = await supabase.from('ncsa_fines').insert(payload).select('id').single();
    if (!isFirstSync && inserted) {
      const title = `NCSA fine — ${f.club}`;
      const body = `${f.reason} — $${f.amount?.toFixed(2) ?? '?'} (${f.teamRawName})`;
      await notifyClubAdmins(supabase, clubId, title, body, 'ncsa_fine', { fine_id: (inserted as any).id });
      if (teamId) await notifyTeamCoaches(supabase, teamId, title, body, 'ncsa_fine', { fine_id: (inserted as any).id });
      await supabase.from('ncsa_fines').update({ notified_at: new Date().toISOString() }).eq('id', (inserted as any).id);
    }
  }
}

// Division codes are [B|G] + 2-digit age + flight (e.g. "B08B4", "G09R") —
// confirmed against every report this integration scrapes. U8 games
// (age 08) don't use referees, so a "gap" bordering one carries no real
// idle-ref fee risk, whichever side of the gap it's on.
function isU8Division(division: string | null): boolean {
  return !!division && /^[bg]08/i.test(division);
}

async function syncConflicts(supabase: SB, clubId: string, overlaps: NcsaConflict[], gaps: NcsaConflict[]) {
  await supabase.from('ncsa_schedule_conflicts').delete().eq('club_id', clubId);
  // NCSA's own Gap Time report defaults to "2 hours or more," but a gap
  // of exactly 2 hours isn't actually worth flagging — only real outliers
  // beyond that. U8 games are excluded outright — no referee, no gap fee
  // risk, regardless of duration.
  const realGaps = gaps.filter((c) =>
    (c.minutes == null || c.minutes > 120) && !isU8Division(c.a.division) && !isU8Division(c.b.division));
  const rows = [...overlaps.map((c) => toConflictRow(clubId, 'overlap', c)), ...realGaps.map((c) => toConflictRow(clubId, 'gap', c))];
  if (rows.length) await supabase.from('ncsa_schedule_conflicts').insert(rows);
}

async function syncIssues(
  supabase: SB, clubId: string, kind: 'missing_score' | 'tbs', rows: NcsaGameRow[], teamByRawName: Map<string, string>,
) {
  const { count } = await supabase.from('ncsa_game_issues').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('kind', kind);
  const isFirstSync = (count ?? 0) === 0;

  const { data: existingRows } = await supabase.from('ncsa_game_issues').select('id, ncsa_game_id, resolved_at').eq('club_id', clubId).eq('kind', kind);
  const existingByGameId = new Map(((existingRows ?? []) as any[]).map((r) => [r.ncsa_game_id as string, r]));
  const seenIds = new Set(rows.map((r) => r.gameId));

  for (const r of rows) {
    const teamId = teamByRawName.get(r.home) ?? teamByRawName.get(r.visitor) ?? null;
    const existing = existingByGameId.get(r.gameId);
    const payload: Record<string, unknown> = {
      club_id: clubId, kind, ncsa_game_id: r.gameId, event_date: r.date, event_time: r.time,
      field: kind === 'tbs' ? null : r.fieldOrType, division: r.division, home_team: r.home, visitor_team: r.visitor,
      tbs_type: kind === 'tbs' ? r.fieldOrType : null, team_id: teamId, resolved_at: null,
    };
    if (existing) {
      await supabase.from('ncsa_game_issues').update(payload).eq('id', (existing as any).id);
      continue;
    }
    const { data: inserted } = await supabase.from('ncsa_game_issues').insert(payload).select('id').single();
    if (!isFirstSync && inserted && teamId) {
      const title = kind === 'tbs' ? 'New TBS game added' : 'Score not yet entered';
      const body = kind === 'tbs'
        ? `${r.home} vs ${r.visitor} (${r.division}) is now a TBS game — not yet scheduled.`
        : `${r.home} vs ${r.visitor} (${r.division}) on ${r.date} still has no score entered. NCSA can fine $25 for a delayed score (Rule 6.12).`;
      await notifyTeamCoaches(supabase, teamId, title, body, kind === 'tbs' ? 'ncsa_tbs' : 'ncsa_missing_score', { issue_id: (inserted as any).id });
      await supabase.from('ncsa_game_issues').update({ notified_at: new Date().toISOString() }).eq('id', (inserted as any).id);
    }
  }

  const toResolve = ((existingRows ?? []) as any[]).filter((r) => !seenIds.has(r.ncsa_game_id) && !r.resolved_at).map((r) => r.id as string);
  if (toResolve.length) await supabase.from('ncsa_game_issues').update({ resolved_at: new Date().toISOString() }).in('id', toResolve);
}

// cautionEjectRpt.cfm — persists across syncs (like ncsa_game_issues,
// unlike the delete+reinsert conflicts table) since a discipline history
// is worth keeping, not just a snapshot. served_at is never touched here
// — NCSA's report exposes no "games served" counter, so marking a
// suspension served is a manual club-admin action in the UI, not
// something a sync can ever infer.
async function syncDiscipline(supabase: SB, clubId: string, rows: NcsaDisciplineRow[], teamByRawName: Map<string, string>) {
  const { count } = await supabase.from('ncsa_discipline_records').select('id', { count: 'exact', head: true }).eq('club_id', clubId);
  const isFirstSync = (count ?? 0) === 0;

  for (const r of rows) {
    const teamId = teamByRawName.get(r.teamRawName) ?? null;
    const { data: existing } = await supabase
      .from('ncsa_discipline_records').select('id')
      .eq('club_id', clubId).eq('ncsa_game_id', r.gameId).eq('player_name', r.player).maybeSingle();
    const payload = {
      club_id: clubId, ncsa_game_id: r.gameId, division: r.division, team_raw_name: r.teamRawName, team_id: teamId,
      player_name: r.player, referee_name: r.referee, filed_on: r.filedOn, game_date: r.gameDate, game_time: r.gameTime,
      misconduct: r.misconduct, event: r.event, scraped_at: new Date().toISOString(),
    };
    if (existing) {
      await supabase.from('ncsa_discipline_records').update(payload).eq('id', (existing as any).id);
      continue;
    }
    const { data: inserted } = await supabase.from('ncsa_discipline_records').insert(payload).select('id').single();
    if (!isFirstSync && inserted) {
      // Confirmed real event values: "Cautioned" and "Sent off" — not
      // "Ejected" despite the report's own name, so match loosely.
      const isEjection = /sent off|eject|red/i.test(r.event);
      const title = isEjection ? `Player sent off — ${r.teamRawName}` : `Caution issued — ${r.teamRawName}`;
      const body = isEjection
        ? `${r.player} was sent off (${r.misconduct}). NCSA bars a sent-off player from all NCSA activity, including reffing, until the suspension is served.`
        : `${r.player} was cautioned — ${r.misconduct}.`;
      await notifyClubAdmins(supabase, clubId, title, body, 'ncsa_discipline', { record_id: (inserted as any).id });
      if (teamId) await notifyTeamCoaches(supabase, teamId, title, body, 'ncsa_discipline', { record_id: (inserted as any).id });
      await supabase.from('ncsa_discipline_records').update({ notified_at: new Date().toISOString() }).eq('id', (inserted as any).id);
    }
  }
}

async function syncClub(supabase: SB, clubId: string): Promise<{ error?: string }> {
  const { data: credRows } = await supabase.rpc('ncsa_get_club_credential', { p_club_id: clubId });
  const cred = (credRows as any[])?.[0];
  if (!cred) return { error: 'not_connected' };

  const session = await ncsaLogin(cred.ncsa_username, cred.ncsa_password);
  if (!session) return { error: 'login_failed' };

  const { data: links } = await supabase.from('team_ncsa_links').select('team_id, ncsa_raw_name, teams!inner(club_id)').eq('teams.club_id', clubId);
  const teamByRawName = new Map(((links ?? []) as any[]).map((l) => [l.ncsa_raw_name as string, l.team_id as string]));

  const [finesHtml, overlapHtml, gapHtml, missingHtml, tbsHtml, fieldListHtml, cautionEjectHtml] = await Promise.all(
    [REPORT_URLS.fines, REPORT_URLS.overlap, REPORT_URLS.gap, REPORT_URLS.missingScore, REPORT_URLS.tbs, REPORT_URLS.fieldList, REPORT_URLS.cautionEject]
      .map((url) => ncsaFetch(url, session).then((r) => r.text())),
  );

  await syncFields(supabase, clubId, parseFieldListReport(fieldListHtml));
  await syncFines(supabase, clubId, parseFinesReport(finesHtml), teamByRawName);
  await syncConflicts(supabase, clubId, parseConflictReport(overlapHtml), parseConflictReport(gapHtml));
  await syncDiscipline(supabase, clubId, parseCautionEjectReport(cautionEjectHtml), teamByRawName);

  // Missing-score only stored/notified once it's actually overdue — the raw
  // report lists every unscored game including ones that haven't been
  // played yet, since a future game trivially has no score. Kickoff+4h
  // approximates Rule 6.12's "4 hours after completion" deadline (exact
  // for a short game, a bit early for an 11v11 that runs long — advisory
  // either way, not a real fine calculation).
  const now = Date.now();
  const overdue = parseGameListReport(missingHtml).filter((r) => {
    // The missing-score report also lists games that are themselves TBS
    // (field column reads "TBS (L)"/"(V)"/"(H)"/"(R)"/"(GC)"/"(PPD)", or a
    // full "To Be Scheduled-..." placeholder) — those trivially have no
    // score because they haven't been played yet, not because a coach
    // forgot to enter one. Already covered by the TBS Games tab instead.
    if (/^(to be scheduled|tbs)\b/i.test(r.fieldOrType)) return false;
    if (!r.date || !r.time) return false;
    return new Date(`${r.date}T${r.time}`).getTime() + 4 * 60 * 60 * 1000 < now;
  });
  await syncIssues(supabase, clubId, 'missing_score', overdue, teamByRawName);
  await syncIssues(supabase, clubId, 'tbs', parseGameListReport(tbsHtml), teamByRawName);

  return {};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: { club_id?: string } = {};
  try { body = await req.json(); } catch { /* cron calls with an empty body */ }

  // Deployed with --no-verify-jwt (matches sync-ncsa-schedule). Unlike that
  // function, this one uses its own dedicated cron secret
  // (NCSA_REPORTS_CRON_KEY, set via `supabase secrets set`) rather than a
  // hardcoded literal or the shared service_role key — a clean credential
  // for a function written from scratch, not another copy of the
  // legacy-hardcoded-JWT pattern already flagged elsewhere in this
  // integration.
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

  const results: Record<string, { error?: string }> = {};
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
