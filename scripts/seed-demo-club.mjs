// node scripts/seed-demo-club.mjs
//
// Creates a fully fictional "Harbor City FC" demo club for marketing-site
// screenshots — real DB rows, real auth accounts, zero real third-party
// data. Safe to re-run: deletes any existing Harbor City FC data first.
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

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sb(method, p, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// profiles rows are auto-created by a DB trigger the moment an auth user
// is created, so writing them needs an upsert (merge on id), not a plain
// insert, or it collides with that trigger-made stub row.
async function sbUpsertProfile(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`UPSERT /profiles -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function createAuthUser(email, password, full_name) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name } }),
  });
  const json = await res.json();
  if (!res.ok) {
    if (json?.msg?.includes('already been registered') || json?.code === 'email_exists') return { existing: true, email };
    throw new Error(`createUser ${email} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return { id: json.id, email };
}

// ─── Fictional data pools (no real people, no real clubs) ─────────────────

const BOYS_FIRST = ['Mason','Liam','Noah','James','Ethan','Jack','Owen','Ryan','Connor','Dylan','Carter','Blake','Kyle','Aiden','Caleb','Hunter','Tyler','Logan'];
const GIRLS_FIRST = ['Emma','Olivia','Ava','Sophia','Isabella','Mia','Charlotte','Amelia','Harper','Evelyn','Riley','Aria','Layla','Zoey','Lily','Claire','Nora','Grace'];
const LAST = ['Bennett','Sullivan','Hartley','Okafor','Reyes','Lindqvist','Whitfield','Delgado','Fontaine','Marsh','Okonkwo','Castellano','Novak','Pereira','Dunmore','Aldridge','Varga','Sato','Brennan','Kowalski'];

const POSITIONS = ['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST'];
const OPPONENTS = ['Westbrook SC','Lakeside Rangers','Granite City FC','Cedar Valley United','Northfield Athletic','Briar Creek SC','Stonebridge FC','Ashford Town','Elm Harbor FC','Meridian SC','Copper Ridge FC','Pinehurst Athletic'];
const LOCATIONS = ['Harbor City Soccer Complex','Meridian Park Fields','Cedar Valley Athletic Complex','Bayfront Sports Park','Union Community Fields','Northgate Recreation Complex'];

let _seed = 7;
function rand(min, max) { _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff; return min + (_seed % (max - min + 1)); }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }

function genPlayers(count, gender) {
  const pool = gender === 'girls' ? GIRLS_FIRST : BOYS_FIRST;
  const used = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let jersey = rand(1, 30);
    let tries = 0;
    while (used.has(jersey) && tries < 50) { jersey = rand(1, 99); tries++; }
    used.add(jersey);
    const first = pool[(i * 5 + rand(0, pool.length - 1)) % pool.length];
    const last = LAST[(i * 9 + rand(0, LAST.length - 1)) % LAST.length];
    out.push({ full_name: `${first} ${last}`, jersey_number: jersey, position: i === 0 ? 'GK' : POSITIONS[1 + (i % (POSITIONS.length - 1))] });
  }
  return out;
}

// Today anchor: 2026-10-29
const TODAY = new Date('2026-10-29T00:00:00');
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function iso(d) { return d.toISOString().slice(0, 10); }

// PostgREST bulk insert requires every row in the array to share the same
// set of keys, so every event row — training or game — carries the full
// field set, with null for whatever doesn't apply.
function emptyEventRow(teamId) {
  return { team_id: teamId, title: '', type: '', event_date: '', event_time: null, location: null, require_rsvp: true, rsvp_lock_at: null, score_home: null, score_away: null };
}

function genEvents(teamId) {
  const events = [];
  // Weekly training, 6 weeks back to 6 weeks forward
  for (let w = -6; w <= 6; w++) {
    const d = addDays(TODAY, w * 7 + rand(-1, 1));
    events.push({
      ...emptyEventRow(teamId),
      title: 'Training', type: 'training', event_date: iso(d),
      event_time: `${rand(16, 18)}:${pick(['00','30'])}`, location: pick(LOCATIONS),
    });
  }
  // Biweekly games, 6 weeks back to 4 weeks forward
  for (let w = -6; w <= 4; w += 2) {
    const d = addDays(TODAY, w * 7 + rand(0, 2));
    const home = rand(0, 1) === 1;
    const isPast = d < TODAY;
    const row = {
      ...emptyEventRow(teamId),
      title: `${home ? 'vs' : '@'} ${pick(OPPONENTS)}`, type: 'game',
      event_date: iso(d), event_time: `${rand(9, 13)}:${pick(['00','30'])}`,
      location: home ? pick(LOCATIONS) : `Away — ${pick(OPPONENTS)} Field`,
      rsvp_lock_at: new Date(d.getTime() - 24 * 3600 * 1000).toISOString(),
    };
    if (isPast) { row.score_home = rand(0, 4); row.score_away = rand(0, 4); }
    events.push(row);
  }
  return events;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Harbor City FC demo club...\n');

  // First-run only: this script intentionally has NO delete/cleanup logic.
  // Confirmed via a read-only check before ever running this that
  // harbor-city-fc does not exist yet. If this club ever needs to be
  // reset, do that as a separate, explicitly-scoped, user-confirmed step
  // rather than folding broad deletes into this creation script.

  // 2. Create club
  const [club] = await sb('POST', '/clubs', {
    name: 'Harbor City FC',
    slug: 'harbor-city-fc',
    tagline: "Harbor City's home club since 2012",
    logo_url: `${SUPABASE_URL}/storage/v1/object/public/club-logos/harbor-city-fc/logo.png`,
    primary_color: '#0B3D62',
    secondary_color: '#F5A623',
    country: 'US',
    currency: 'USD',
    timezone: 'America/New_York',
    home_kit_color: '#0B3D62',
    away_kit_color: '#FFFFFF',
    training_kit_color: '#F5A623',
  });
  console.log(`Club created: Harbor City FC (${club.id})`);

  // 2b. Give it a plan that allows more than 1 team (free plan caps at 1)
  await sb('POST', '/subscriptions', { club_id: club.id, plan: 'starter', status: 'active' });

  // 3. Create teams
  const TEAM_DEFS = [
    { name: 'U10 Girls', age_group: 'U10', gender: 'girls', players: 14 },
    { name: 'U12 Boys', age_group: 'U12', gender: 'boys', players: 16 },
    { name: 'U14 Boys', age_group: 'U14', gender: 'boys', players: 18 },
  ];
  const teams = {};
  for (const def of TEAM_DEFS) {
    const [team] = await sb('POST', '/teams', { club_id: club.id, name: def.name, age_group: def.age_group, gender: def.gender, season: '2026/27' });
    teams[def.name] = team;
  }
  console.log(`Teams created: ${Object.keys(teams).join(', ')}`);

  // 4. Create auth accounts + profiles
  const now = new Date().toISOString();
  const PASSWORD = 'HarborDemo26!';

  const adminUser = await createAuthUser('rick+hcfc-admin@mdssoccer.com', PASSWORD, 'Alex Rivera');
  await sbUpsertProfile({
    id: adminUser.id, full_name: 'Alex Rivera', role: 'org_admin', club_id: club.id,
    default_team_id: teams['U12 Boys'].id, onboarded_at: now, phone: '(555) 014-8823',
    share_contact_with_team: true,
  });

  const parentUser = await createAuthUser('rick+hcfc-parent@mdssoccer.com', PASSWORD, 'Dana Whitfield');
  await sbUpsertProfile({
    id: parentUser.id, full_name: 'Dana Whitfield', role: 'player', club_id: club.id,
    default_team_id: teams['U12 Boys'].id, onboarded_at: now, phone: '(555) 019-2254',
    share_contact_with_team: true,
  });

  const p2 = await createAuthUser('rick+hcfc-p2@mdssoccer.com', PASSWORD, 'Marcus Bell');
  await sbUpsertProfile({ id: p2.id, full_name: 'Marcus Bell', role: 'player', club_id: club.id, onboarded_at: now, phone: '(555) 022-9981', share_contact_with_team: true });

  const p3 = await createAuthUser('rick+hcfc-p3@mdssoccer.com', PASSWORD, 'Priya Shah');
  await sbUpsertProfile({ id: p3.id, full_name: 'Priya Shah', role: 'player', club_id: club.id, onboarded_at: now, phone: '(555) 030-4417', share_contact_with_team: true });

  console.log('Demo accounts created.');

  // 5. Coach on all 3 teams (org_admin so admin UI works everywhere too)
  for (const t of Object.values(teams)) {
    await sb('POST', '/team_members', { team_id: t.id, profile_id: adminUser.id, role: 'coach' });
  }

  // 6. Players per team
  const playersByTeam = {};
  for (const def of TEAM_DEFS) {
    const team = teams[def.name];
    const defs = genPlayers(def.players, def.gender);
    const inserted = await sb('POST', '/players', defs.map(p => ({ team_id: team.id, ...p })));
    playersByTeam[def.name] = inserted;
    console.log(`  ${def.name.padEnd(12)} -> ${inserted.length} players`);
  }

  // 7. Link parent (Dana) as guardian of one player on each of two teams (multi-child family)
  const u10Kid = playersByTeam['U10 Girls'][0];
  const u12Kid = playersByTeam['U12 Boys'][0];
  await sb('PATCH', `/players?id=eq.${u10Kid.id}`, { profile_id: parentUser.id, full_name: 'Zoey Whitfield' });
  await sb('PATCH', `/players?id=eq.${u12Kid.id}`, { profile_id: parentUser.id, full_name: 'Jack Whitfield' });
  await sb('POST', '/team_members', { team_id: teams['U10 Girls'].id, profile_id: parentUser.id, role: 'parent' });
  await sb('POST', '/team_members', { team_id: teams['U12 Boys'].id, profile_id: parentUser.id, role: 'parent' });

  // Flavor parents on U12 Boys / U14 Boys
  const u12Kid2 = playersByTeam['U12 Boys'][1];
  const u14Kid = playersByTeam['U14 Boys'][0];
  await sb('PATCH', `/players?id=eq.${u12Kid2.id}`, { profile_id: p2.id, full_name: 'Owen Bell' });
  await sb('PATCH', `/players?id=eq.${u14Kid.id}`, { profile_id: p3.id, full_name: 'Aria Shah' });
  await sb('POST', '/team_members', { team_id: teams['U12 Boys'].id, profile_id: p2.id, role: 'parent' });
  await sb('POST', '/team_members', { team_id: teams['U14 Boys'].id, profile_id: p3.id, role: 'parent' });

  console.log('Guardians linked (multi-child family on two teams).');

  // 8. Events per team + RSVPs
  for (const def of TEAM_DEFS) {
    const team = teams[def.name];
    const events = await sb('POST', '/events', genEvents(team.id).map(e => ({ ...e, created_by: adminUser.id })));
    const players = playersByTeam[def.name];

    // RSVP on the next upcoming game/training: mix attending/not_attending
    const upcoming = events.filter(e => new Date(e.event_date) >= TODAY).sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
    if (upcoming) {
      const rsvps = players.slice(0, Math.min(players.length, 11)).map((p, i) => ({
        event_id: upcoming.id, player_id: p.id, status: i % 5 === 4 ? 'not_attending' : 'attending',
      }));
      await sb('POST', '/event_rsvps', rsvps);
    }
    console.log(`  ${def.name.padEnd(12)} -> ${events.length} events`);
  }

  // 9. Announcements
  await sb('POST', '/announcements', [
    { club_id: club.id, team_id: null, title: 'Fall Picture Day — Nov 8th', body: "Team and individual photos at Harbor City Soccer Complex. Please arrive 15 minutes early in your home kit.", pinned: true, is_club_wide: true, created_by: adminUser.id },
    { club_id: club.id, team_id: teams['U12 Boys'].id, title: 'Parent meeting Thursday 7pm', body: 'Quick season check-in at the clubhouse — spring schedule, carpool sign-ups, and uniform orders.', pinned: false, is_club_wide: false, created_by: adminUser.id },
  ]);

  // 10. Seed a lively Team Chat thread for U12 Boys
  const [convo] = await sb('POST', '/conversations', { team_id: teams['U12 Boys'].id, type: 'team_group' });
  await sb('POST', '/conversation_participants', [
    { conversation_id: convo.id, profile_id: adminUser.id },
    { conversation_id: convo.id, profile_id: parentUser.id },
    { conversation_id: convo.id, profile_id: p2.id },
  ]);
  const msgs = [
    { sender_id: adminUser.id, body: "Reminder: Saturday's game moved to 10am kickoff, same field." },
    { sender_id: parentUser.id, body: 'Got it, thanks coach! Jack is excited, ankle feels good this week.' },
    { sender_id: p2.id, body: 'Owen can bring the extra cones and pinnies Saturday if that helps.' },
    { sender_id: adminUser.id, body: "Perfect, thanks Marcus. See everyone at training Thursday first." },
  ];
  await sb('POST', '/messages', msgs.map(m => ({ conversation_id: convo.id, ...m })));

  console.log('\nDone!');
  console.log(`  Club slug: harbor-city-fc`);
  console.log(`  Coach/admin login:  rick+hcfc-admin@mdssoccer.com / ${PASSWORD}`);
  console.log(`  Parent login:       rick+hcfc-parent@mdssoccer.com / ${PASSWORD}`);
}

main().catch(err => { console.error(err); process.exit(1); });
