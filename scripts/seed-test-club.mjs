// node scripts/seed-test-club.mjs
// Creates "Riverside FC" test club with 30 teams, full rosters, and schedule.
// Safe to re-run — deletes existing Riverside FC data first.

const SUPABASE_URL = 'https://nandbuwogaxmrzsstttd.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbmRidXdvZ2F4bXJ6c3N0dHRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3MDI0MywiZXhwIjoyMDk3MTQ2MjQzfQ.E6uuet4_AhAY9PH8LS1_crFG11obwv04ohGpv-BZgDk';

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ─── Name pools ───────────────────────────────────────────────────────────────

const BOYS_FIRST  = ['Mason','Liam','Noah','James','Ethan','Jack','Owen','Ryan','Connor','Dylan','Carter','Blake','Kyle','Aiden','Caleb','Hunter','Tyler','Logan','Gavin','Finn','Marcus','Eli','Nolan','Brody','Miles','Chase','Cole','Jaxon','Bryce','Reid','Tanner','Wyatt','Spencer','Austin','Zane','Tristan','Cody','Drew','Ian','Luke'];
const GIRLS_FIRST = ['Emma','Olivia','Ava','Sophia','Isabella','Mia','Charlotte','Amelia','Harper','Evelyn','Riley','Aria','Layla','Zoey','Lily','Claire','Nora','Lucy','Hannah','Grace','Stella','Violet','Aurora','Chloe','Penelope','Savannah','Brooklyn','Paisley','Skylar','Audrey','Autumn','Mackenzie','Kylie','Alexis','Reagan','Addison','Kennedy','Maya','Leah','Elena'];
const LAST        = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Anderson','Taylor','Thomas','Moore','Jackson','Martin','White','Thompson','Harris','Lewis','Roberts','Walker','Hall','Allen','Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Carter','Mitchell','Perez','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Rogers','Reed','Cook','Morgan','Bell','Murphy','Bailey','Rivera','Cooper','Richardson','Cox','Howard','Ward','Torres','Peterson','Gray'];
const PARENT_FIRST = ['Jennifer','Michael','Sarah','David','Jessica','Christopher','Amy','Matthew','Stephanie','Andrew','Lauren','Kevin','Nicole','Brian','Melissa','Jason','Ashley','Timothy','Rachel','Ryan','Heather','Daniel','Kimberly','Eric','Amanda','Jeffrey','Christine','Scott','Lisa','Gregory','Patricia','Kenneth','Sandra','Joshua','Donna','Mark','Nancy','Robert','Carol'];

const GK_POSITIONS = ['GK'];
const FIELD_POSITIONS = ['CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CF'];

const LOCATIONS = [
  '1301 Flushing Meadows-Corona Park, Queens, NY 11368',
  '7000 Soccer Park Dr, St. Louis, MO 63129',
  '450 Veterans Blvd, Rutherford, NJ 07070',
  '3999 E Speedway Blvd, Tucson, AZ 85712',
  '2001 Martin Luther King Jr Dr, Atlanta, GA 30310',
  '7900 Lefferts Blvd, Kew Gardens, NY 11415',
  '1 Ivy St, Bridgeview, IL 60455',
  '3200 E 9th Ave, Denver, CO 80206',
  '5601 Kirby Dr, Houston, TX 77005',
  '1155 Mulberry St, San Jose, CA 95125',
];

const OPPONENTS = [
  'FC United','Red Bulls Academy','Galaxy SC','Strikers FC','Rapids Youth',
  'Dynamo SC','Timbers Academy','Sounders FC','Crew SC','Fire Academy',
  'Revolution SC','Sporting KC Youth','Real Salt Lake Academy','Whitecaps FC',
  'Impact SC','Colorado Rush','Ohio Premier','Michigan Hawks','Indiana Fire',
  'Virginia Rush',
];

// ─── Team definitions (30 teams) ─────────────────────────────────────────────

const TEAMS = [
  // U6
  { name: 'U6 Boys',       age_group: 'U6',  gender: 'Boys',  players: 10, format: '4v4' },
  { name: 'U6 Girls',      age_group: 'U6',  gender: 'Girls', players: 10, format: '4v4' },
  // U7
  { name: 'U7 Boys',       age_group: 'U7',  gender: 'Boys',  players: 10, format: '4v4' },
  { name: 'U7 Girls',      age_group: 'U7',  gender: 'Girls', players: 10, format: '4v4' },
  // U8
  { name: 'U8 Boys Red',   age_group: 'U8',  gender: 'Boys',  players: 12, format: '7v7' },
  { name: 'U8 Boys Blue',  age_group: 'U8',  gender: 'Boys',  players: 12, format: '7v7' },
  { name: 'U8 Girls Red',  age_group: 'U8',  gender: 'Girls', players: 12, format: '7v7' },
  { name: 'U8 Girls Blue', age_group: 'U8',  gender: 'Girls', players: 12, format: '7v7' },
  // U9
  { name: 'U9 Boys A',     age_group: 'U9',  gender: 'Boys',  players: 14, format: '7v7' },
  { name: 'U9 Boys B',     age_group: 'U9',  gender: 'Boys',  players: 14, format: '7v7' },
  { name: 'U9 Girls A',    age_group: 'U9',  gender: 'Girls', players: 14, format: '7v7' },
  { name: 'U9 Girls B',    age_group: 'U9',  gender: 'Girls', players: 14, format: '7v7' },
  // U10
  { name: 'U10 Boys A',    age_group: 'U10', gender: 'Boys',  players: 15, format: '9v9' },
  { name: 'U10 Boys B',    age_group: 'U10', gender: 'Boys',  players: 15, format: '9v9' },
  { name: 'U10 Girls A',   age_group: 'U10', gender: 'Girls', players: 15, format: '9v9' },
  { name: 'U10 Girls B',   age_group: 'U10', gender: 'Girls', players: 15, format: '9v9' },
  // U11
  { name: 'U11 Boys A',    age_group: 'U11', gender: 'Boys',  players: 16, format: '9v9' },
  { name: 'U11 Boys B',    age_group: 'U11', gender: 'Boys',  players: 16, format: '9v9' },
  { name: 'U11 Girls A',   age_group: 'U11', gender: 'Girls', players: 16, format: '9v9' },
  { name: 'U11 Girls B',   age_group: 'U11', gender: 'Girls', players: 16, format: '9v9' },
  // U12
  { name: 'U12 Boys A',    age_group: 'U12', gender: 'Boys',  players: 18, format: '11v11' },
  { name: 'U12 Girls A',   age_group: 'U12', gender: 'Girls', players: 18, format: '11v11' },
  // U13
  { name: 'U13 Boys A',    age_group: 'U13', gender: 'Boys',  players: 18, format: '11v11' },
  { name: 'U13 Girls A',   age_group: 'U13', gender: 'Girls', players: 18, format: '11v11' },
  // U14
  { name: 'U14 Boys A',    age_group: 'U14', gender: 'Boys',  players: 18, format: '11v11' },
  { name: 'U14 Girls A',   age_group: 'U14', gender: 'Girls', players: 18, format: '11v11' },
  // U15
  { name: 'U15 Boys A',    age_group: 'U15', gender: 'Boys',  players: 18, format: '11v11' },
  { name: 'U15 Girls A',   age_group: 'U15', gender: 'Girls', players: 18, format: '11v11' },
  // U16
  { name: 'U16 Boys A',    age_group: 'U16', gender: 'Boys',  players: 18, format: '11v11' },
  // U17
  { name: 'U17 Boys A',    age_group: 'U17', gender: 'Boys',  players: 18, format: '11v11' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seed = 42;
function rand(min, max) { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return min + Math.abs(_seed) % (max - min + 1); }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }

function genEmail(first, last, domain) {
  return `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
}

const DOMAINS = ['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com'];

function genPlayers(count, gender, teamName) {
  const firstPool = gender === 'Girls' ? GIRLS_FIRST : BOYS_FIRST;
  const usedJerseys = new Set();
  const players = [];

  for (let i = 0; i < count; i++) {
    let jersey = rand(1, 22);
    let attempts = 0;
    while (usedJerseys.has(jersey) && attempts < 50) { jersey = rand(1, 99); attempts++; }
    usedJerseys.add(jersey);

    const first = firstPool[(i * 7 + rand(0, firstPool.length - 1)) % firstPool.length];
    const last  = LAST[(i * 13 + rand(0, LAST.length - 1)) % LAST.length];
    const pos   = i === 0 ? 'GK' : FIELD_POSITIONS[i % FIELD_POSITIONS.length];
    const parentFirst = PARENT_FIRST[(i * 11 + rand(0, PARENT_FIRST.length - 1)) % PARENT_FIRST.length];
    const parentLast  = last;

    players.push({
      full_name:     `${first} ${last}`,
      jersey_number: jersey,
      position:      pos,
      _parent_email: genEmail(parentFirst, parentLast, pick(DOMAINS)),
    });
  }
  return players;
}

function genEvents(teamId, count = 12) {
  const events = [];
  // 8 training sessions + 4 games spread across next 3 months
  const baseDate = new Date('2026-07-10');

  for (let i = 0; i < 8; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i * 7 + rand(0, 2));
    const dayStr = d.toISOString().slice(0, 10);
    const hour = rand(16, 19);
    events.push({
      team_id:    teamId,
      title:      'Training',
      type:       'training',
      event_date: dayStr,
      event_time: `${hour.toString().padStart(2,'0')}:00`,
      location:   pick(LOCATIONS),
    });
  }

  for (let i = 0; i < 4; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i * 14 + rand(0, 3));
    const dayStr = d.toISOString().slice(0, 10);
    const home   = rand(0, 1) === 1;
    events.push({
      team_id:    teamId,
      title:      `${home ? 'vs' : '@'} ${pick(OPPONENTS)}`,
      type:       'game',
      event_date: dayStr,
      event_time: `${rand(9, 14).toString().padStart(2,'0')}:${rand(0,1)===0?'00':'30'}`,
      location:   home ? pick(LOCATIONS) : `Away – ${pick(OPPONENTS)} Field`,
    });
  }

  return events;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏟  Seeding Riverside FC test club…\n');

  // 1. Clean up any existing test club
  const existing = await sb('GET', '/clubs?slug=eq.riverside-fc&select=id', null);
  if (existing?.length) {
    const cid = existing[0].id;
    console.log(`  Removing existing Riverside FC (${cid})…`);
    // Delete in FK order
    const teams = await sb('GET', `/teams?club_id=eq.${cid}&select=id`, null);
    for (const t of teams ?? []) {
      await sb('DELETE', `/event_rsvps?event_id=in.(select id from events where team_id = '${t.id}')`, null).catch(() => {});
      await sb('DELETE', `/events?team_id=eq.${t.id}`, null);
      await sb('DELETE', `/invites?team_id=eq.${t.id}`, null);
      await sb('DELETE', `/players?team_id=eq.${t.id}`, null);
    }
    await sb('DELETE', `/teams?club_id=eq.${cid}`, null);
    await sb('DELETE', `/clubs?id=eq.${cid}`, null);
    console.log('  Cleaned.\n');
  }

  // 2. Create club
  const [club] = await sb('POST', '/clubs', {
    name:            'Riverside FC',
    slug:            'riverside-fc',
    primary_color:   '#2563eb',
    secondary_color: '#ffffff',
  });
  console.log(`✅ Club created: Riverside FC (${club.id})\n`);

  let totalPlayers = 0;
  let totalEvents  = 0;

  // 3. Create teams, players, events
  for (const def of TEAMS) {
    _seed += def.name.length; // vary seed per team

    // Insert team
    const [team] = await sb('POST', '/teams', {
      club_id:   club.id,
      name:      def.name,
      age_group: def.age_group,
      season:    '2025/26',
    });

    // Players
    const playerDefs = genPlayers(def.players, def.gender, def.name);
    const playerRows = playerDefs.map(p => ({
      team_id:       team.id,
      full_name:     p.full_name,
      jersey_number: p.jersey_number,
      position:      p.position,
    }));
    const inserted = await sb('POST', '/players', playerRows);

    // Invites (parent emails)
    const inviteRows = (inserted ?? []).map((dbP, i) => ({
      team_id:    team.id,
      player_id:  dbP.id,
      email:      playerDefs[i]._parent_email,
    }));
    await sb('POST', '/invites', inviteRows);

    // Events
    const evDefs = genEvents(team.id);
    await sb('POST', '/events', evDefs);

    totalPlayers += playerDefs.length;
    totalEvents  += evDefs.length;
    console.log(`  ✓ ${def.name.padEnd(18)} — ${def.players} players, ${evDefs.length} events`);
  }

  console.log(`\n✅ Done!`);
  console.log(`   Club:    Riverside FC`);
  console.log(`   Slug:    riverside-fc`);
  console.log(`   Teams:   ${TEAMS.length}`);
  console.log(`   Players: ${totalPlayers}`);
  console.log(`   Events:  ${totalEvents}`);
  console.log(`   Club ID: ${club.id}`);
  console.log(`\n   Dashboard: https://dugoutfc.app/dashboard`);
}

main().catch(err => { console.error(err); process.exit(1); });
