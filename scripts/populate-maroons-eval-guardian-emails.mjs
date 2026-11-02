// node scripts/populate-maroons-eval-guardian-emails.mjs
//
// Writes each player's parent email(s) from the local-only mapping file
// (scripts/data/maroons-eval-emails.local.json, produced by
// seed-maroons-eval-club.mjs) into players.guardian_emails — a column
// nothing else in the app reads, on a club with outgoing_emails_disabled
// set. Run only after supabase/migrations/
// 20261102000003_club_email_kill_switch_and_player_guardian_emails.sql
// has been applied (that migration adds the column this script writes to).
//
// Reads Supabase URL/service-role key from .env.local (not hardcoded).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  try {
    const text = readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv('.env.local');
loadEnv('.env');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${pathSuffix}${query} -> ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

const mapPath = path.join(__dirname, 'data', 'maroons-eval-emails.local.json');
const emailMap = JSON.parse(readFileSync(mapPath, 'utf8'));
const playerIds = Object.keys(emailMap);
console.log(`Loaded emails for ${playerIds.length} players`);

// Confirm the kill switch is actually on before writing a single row —
// writing real PII onto a club that isn't locked down would defeat the
// entire point of this script.
const [club] = await sb('clubs', { query: `?slug=eq.maroons-sc-evaluations&select=id,outgoing_emails_disabled` });
if (!club) { console.error('Club not found'); process.exit(1); }
if (!club.outgoing_emails_disabled) {
  console.error('club.outgoing_emails_disabled is not true — refusing to write guardian emails until the kill switch is confirmed on.');
  process.exit(1);
}
console.log('Confirmed: outgoing_emails_disabled = true for this club');

let updated = 0, missing = 0;
for (const playerId of playerIds) {
  const { emails } = emailMap[playerId];
  if (!emails?.length) { missing++; continue; }
  await sb('players', { method: 'PATCH', query: `?id=eq.${playerId}`, body: { guardian_emails: emails } });
  updated++;
  if (updated % 50 === 0) console.log(`  ...${updated}/${playerIds.length}`);
}

console.log(`\nDone. Updated ${updated} players${missing ? `, ${missing} had no emails to write` : ''}.`);
