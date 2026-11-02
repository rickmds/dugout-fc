// node scripts/send-maroons-eval-pdfs.mjs            (dry run — lists only)
// node scripts/send-maroons-eval-pdfs.mjs --send      (actually sends)
//
// The real send step for the Maroons SC (Evaluations) project: for every
// evaluation that's been reviewed (status approved/published), has at
// least one checked recipient (send_to_emails), and hasn't already gone
// out (sent_at is null), fetches its PDF from the already-deployed
// /api/evaluations/[evalId]/pdf route (same code path as the in-dashboard
// "PDF" preview button — never a second, hand-rebuilt render) and emails
// it via the existing send-team-email edge function.
//
// This script is the only thing that ever triggers a real send for this
// club — there is no button in the UI that does this. Meant to be run
// only on explicit request, not on a schedule or as a side effect of
// anything else.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

function loadEnv(file) {
  try {
    const text = readFileSync(path.join(REPO, file), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv('web/.env.local');
loadEnv('.env.local');
loadEnv('.env');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://pulse-fc.app').replace(/\/$/, '');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SEND = process.argv.includes('--send');

async function sb(pathSuffix, { method = 'GET', body, query = '' } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathSuffix}${query}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'PATCH' ? 'return=minimal' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathSuffix}${query} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const [club] = await sb('clubs', { query: '?slug=eq.maroons-sc-evaluations&select=id,name,logo_url,primary_color,outgoing_emails_disabled' });
if (!club) { console.error('Club not found'); process.exit(1); }

// Opposite check from every other script in this project: THIS one needs
// the kill switch OFF to do its job, and must refuse otherwise.
if (club.outgoing_emails_disabled) {
  console.error('club.outgoing_emails_disabled is still true — refusing to send anything. Turn it off first if this club is ready.');
  process.exit(1);
}
console.log(`Confirmed: outgoing_emails_disabled = false for ${club.name}\n`);

const teams = await sb('teams', { query: `?club_id=eq.${club.id}&select=id,name` });
const teamNameById = new Map(teams.map(t => [t.id, t.name]));
const teamIds = teams.map(t => t.id).join(',');

// approved/published only — a coach submitting isn't the same as the
// admin having actually reviewed it. submitted-but-unreviewed is
// deliberately excluded.
const evals = await sb('player_evaluations', {
  query: `?team_id=in.(${teamIds})&status=in.(approved,published)&sent_at=is.null&select=id,player_id,team_id,season_label,period_label,status,send_to_emails,players(full_name)`,
});

const ready = evals.filter(e => (e.send_to_emails ?? []).length > 0);
const skippedNoRecipients = evals.filter(e => (e.send_to_emails ?? []).length === 0);

console.log(`${evals.length} approved/published evaluations not yet sent.`);
console.log(`${ready.length} have at least one recipient checked — these are what would send.`);
if (skippedNoRecipients.length) {
  console.log(`${skippedNoRecipients.length} have ZERO recipients checked — skipped, not an error:`);
  for (const e of skippedNoRecipients) console.log(`  ${e.players?.full_name} (${teamNameById.get(e.team_id)})`);
}
console.log('');

if (!ready.length) {
  console.log('Nothing to send.');
  process.exit(0);
}

console.log(`${SEND ? 'SENDING' : 'DRY RUN — pass --send to actually send'}:\n`);

let sent = 0, failed = 0;
for (const ev of ready) {
  const teamName = teamNameById.get(ev.team_id);
  const label = `${ev.players?.full_name} (${teamName}) -> ${ev.send_to_emails.join(', ')}`;

  if (!SEND) { console.log(`  would send: ${label}`); continue; }

  try {
    const pdfRes = await fetch(`${APP_URL}/api/evaluations/${ev.id}/pdf`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!pdfRes.ok) throw new Error(`pdf fetch ${pdfRes.status}: ${await pdfRes.text()}`);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    const pdfBase64 = pdfBuf.toString('base64');

    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-team-email`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: ev.send_to_emails.map(email => ({ email, name: ev.players?.full_name ?? 'Player' })),
        cc: [],
        subject: `${ev.players?.full_name}'s ${ev.period_label} Evaluation — ${teamName}`,
        body: `Attached is ${ev.players?.full_name}'s player evaluation for ${ev.period_label}, ${ev.season_label}.`,
        reply_to: null,
        from_name: `${club.name} — Player Evaluations`,
        team_name: teamName,
        attachments: [{ filename: `${ev.players?.full_name}-evaluation.pdf`, content: pdfBase64, type: 'application/pdf', disposition: 'attachment' }],
        club_logo_url: club.logo_url,
        club_name: club.name,
        primary_color: club.primary_color,
        event_info: null,
      }),
    });
    if (!emailRes.ok) throw new Error(`send-team-email ${emailRes.status}: ${await emailRes.text()}`);

    await sb('player_evaluations', {
      method: 'PATCH', query: `?id=eq.${ev.id}`,
      body: { sent_at: new Date().toISOString(), ...(ev.status === 'approved' ? { status: 'published', published_at: new Date().toISOString() } : {}) },
    });

    console.log(`  sent: ${label}`);
    sent++;
  } catch (err) {
    console.error(`  FAILED: ${label} — ${err.message}`);
    failed++;
  }
}

console.log(`\n${SEND ? `Done. Sent ${sent}, failed ${failed}.` : `Dry run complete — ${ready.length} would send. Re-run with --send to actually send.`}`);
