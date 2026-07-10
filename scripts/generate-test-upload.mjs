// node scripts/generate-test-upload.mjs
// Generates scripts/test-full-club.csv — one messy realistic file with
// 30 teams, coaches, full rosters and season schedules.

import fs from 'fs';

// ─── Name pools ───────────────────────────────────────────────────────────────

const BF = ['Mason','Liam','Noah','James','Ethan','Jack','Owen','Ryan','Connor','Dylan','Carter','Blake','Kyle','Aiden','Caleb','Hunter','Tyler','Logan','Gavin','Finn','Marcus','Eli','Nolan','Brody','Miles','Chase','Cole','Jaxon','Bryce','Reid','Tanner','Wyatt','Spencer','Austin','Zane','Ian','Luke','Declan','Beau','Cade'];
const GF = ['Emma','Olivia','Ava','Sophia','Isabella','Mia','Charlotte','Amelia','Harper','Evelyn','Riley','Aria','Layla','Zoey','Lily','Claire','Nora','Lucy','Hannah','Grace','Stella','Violet','Aurora','Chloe','Penelope','Savannah','Brooklyn','Skylar','Audrey','Autumn','Mackenzie','Kylie','Alexis','Reagan','Addison','Kennedy','Maya','Leah','Elena','Sadie'];
const LN = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Anderson','Taylor','Thomas','Moore','Jackson','Martin','White','Thompson','Harris','Lewis','Roberts','Walker','Hall','Allen','Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Carter','Mitchell','Perez','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Rogers','Reed','Cook','Morgan','Bell','Murphy'];
const PF = ['Jennifer','Michael','Sarah','David','Jessica','Christopher','Amy','Matthew','Stephanie','Andrew','Lauren','Kevin','Nicole','Brian','Melissa','Jason','Ashley','Timothy','Rachel','Ryan'];
const DOMAINS = ['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com'];
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
  'Revolution SC','Sporting KC','Real Salt Lake Acad.','Whitecaps FC','Impact SC',
  'Colorado Rush','Ohio Premier','Michigan Hawks','Indiana Fire','Virginia Rush',
  'Jersey Tigers','Eastside Eagles','North Shore FC','Tri-County SC','Lakewood United',
];
const COACH_TITLES = ['Head Coach','Assistant Coach','Team Manager','Head Coach','Head Coach'];

// ─── Teams ────────────────────────────────────────────────────────────────────

const TEAMS = [
  { name:'U6 Boys',        ag:'U6',  gender:'Boys',  count:10 },
  { name:'U6 Girls',       ag:'U6',  gender:'Girls', count:10 },
  { name:'U7 Boys',        ag:'U7',  gender:'Boys',  count:10 },
  { name:'U7 Girls',       ag:'U7',  gender:'Girls', count:10 },
  { name:'U8 Boys Red',    ag:'U8',  gender:'Boys',  count:12 },
  { name:'U8 Boys Blue',   ag:'U8',  gender:'Boys',  count:12 },
  { name:'U8 Girls Red',   ag:'U8',  gender:'Girls', count:12 },
  { name:'U8 Girls Blue',  ag:'U8',  gender:'Girls', count:12 },
  { name:'U9 Boys A',      ag:'U9',  gender:'Boys',  count:14 },
  { name:'U9 Boys B',      ag:'U9',  gender:'Boys',  count:14 },
  { name:'U9 Girls A',     ag:'U9',  gender:'Girls', count:14 },
  { name:'U9 Girls B',     ag:'U9',  gender:'Girls', count:14 },
  { name:'U10 Boys A',     ag:'U10', gender:'Boys',  count:15 },
  { name:'U10 Boys B',     ag:'U10', gender:'Boys',  count:15 },
  { name:'U10 Girls A',    ag:'U10', gender:'Girls', count:15 },
  { name:'U10 Girls B',    ag:'U10', gender:'Girls', count:15 },
  { name:'U11 Boys A',     ag:'U11', gender:'Boys',  count:16 },
  { name:'U11 Boys B',     ag:'U11', gender:'Boys',  count:16 },
  { name:'U11 Girls A',    ag:'U11', gender:'Girls', count:16 },
  { name:'U11 Girls B',    ag:'U11', gender:'Girls', count:16 },
  { name:'U12 Boys A',     ag:'U12', gender:'Boys',  count:18 },
  { name:'U12 Girls A',    ag:'U12', gender:'Girls', count:18 },
  { name:'U13 Boys A',     ag:'U13', gender:'Boys',  count:18 },
  { name:'U13 Girls A',    ag:'U13', gender:'Girls', count:18 },
  { name:'U14 Boys A',     ag:'U14', gender:'Boys',  count:18 },
  { name:'U14 Girls A',    ag:'U14', gender:'Girls', count:18 },
  { name:'U15 Boys A',     ag:'U15', gender:'Boys',  count:18 },
  { name:'U15 Girls A',    ag:'U15', gender:'Girls', count:18 },
  { name:'U16 Boys A',     ag:'U16', gender:'Boys',  count:18 },
  { name:'U17 Boys A',     ag:'U17', gender:'Boys',  count:18 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _s = 1337;
function rnd(min, max) { _s = (_s * 1664525 + 1013904223) & 0xffffffff; return min + Math.abs(_s) % (max - min + 1); }
function pick(a) { return a[rnd(0, a.length - 1)]; }
function email(f, l) { return `${f.toLowerCase()}.${l.toLowerCase()}@${pick(DOMAINS)}`; }

const POSITIONS = ['GK','CB','CB','LB','RB','CDM','CM','CM','CAM','LW','RW','ST','CF','CB','ST'];

// Date helpers
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function timeStr(h, m = 0) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m === 0 ? '00' : '30'} ${ampm}`;
}

// ─── Generate CSV ─────────────────────────────────────────────────────────────

const rows = [];

// Header
rows.push('Riverside FC — 2025/26 Full Club Export');
rows.push('Generated: 07/07/2026');
rows.push('');
rows.push('Type,Team,Age Group,Gender,First Name,Last Name,Jersey #,Role / Position,Email,Event Date,Day,Event Time,Opponent / Note,Location');

for (const team of TEAMS) {
  _s += team.name.length * 17;
  rows.push('');
  rows.push(`# ── ${team.name} ──────────────────────────────────`);

  // Coaches (1-2 per team)
  const numCoaches = rnd(1, 2);
  for (let c = 0; c < numCoaches; c++) {
    const cf = pick(PF), cl = pick(LN);
    rows.push([
      'Coach', team.name, team.ag, team.gender,
      cf, cl, '', COACH_TITLES[c],
      email(cf, cl),
      '', '', '', '', '',
    ].join(','));
  }

  // Players
  const firstPool = team.gender === 'Girls' ? GF : BF;
  const usedJerseys = new Set();
  for (let i = 0; i < team.count; i++) {
    _s += i * 31;
    const pf = firstPool[(i * 7 + Math.abs(_s)) % firstPool.length];
    const pl = LN[(i * 13 + Math.abs(_s >> 4)) % LN.length];
    const ppf = PF[(i * 11 + Math.abs(_s >> 8)) % PF.length];
    const pos = i === 0 ? 'GK' : POSITIONS[i % POSITIONS.length];
    let jersey = rnd(1, 22);
    let tries = 0;
    while (usedJerseys.has(jersey) && tries < 60) { jersey = rnd(1, 99); tries++; }
    usedJerseys.add(jersey);
    rows.push([
      'Player', team.name, team.ag, team.gender,
      pf, pl, jersey, pos,
      email(ppf, pl),
      '', '', '', '', '',
    ].join(','));
  }

  // Schedule — 6 games + 6 training sessions
  // Games on weekends
  const gameBase = '2026-08-29';
  const days = ['Sat','Sun'];
  for (let g = 0; g < 6; g++) {
    const offset   = g * 14 + rnd(0, 6);
    const dateStr  = addDays(gameBase, offset);
    const day      = pick(days);
    const hour     = rnd(9, 14);
    const home     = rnd(0, 1) === 1;
    const opp      = pick(OPPONENTS);
    const location = home ? pick(LOCATIONS) : `Away @ ${opp} Field`;
    rows.push([
      'Game', team.name, team.ag, team.gender,
      '', '', '', home ? 'Home' : 'Away',
      '',
      dateStr, day, timeStr(hour, rnd(0,1)*30),
      home ? `vs ${opp}` : `@ ${opp}`,
      location,
    ].join(','));
  }

  // Training midweek
  const trainBase = '2026-09-02';
  const trainDays = ['Tue','Wed','Thu'];
  for (let t = 0; t < 6; t++) {
    const offset  = t * 7 + rnd(0, 2);
    const dateStr = addDays(trainBase, offset);
    const day     = pick(trainDays);
    const hour    = rnd(17, 19);
    rows.push([
      'Training', team.name, team.ag, team.gender,
      '', '', '', 'Training',
      '',
      dateStr, day, timeStr(hour),
      'Team Training',
      pick(LOCATIONS),
    ].join(','));
  }
}

const out = rows.join('\n');
fs.writeFileSync('scripts/test-full-club.csv', out);

const teamCount   = TEAMS.length;
const playerCount = TEAMS.reduce((s, t) => s + t.count, 0);
const eventCount  = TEAMS.length * 12;

console.log(`✅ Generated scripts/test-full-club.csv`);
console.log(`   Teams:    ${teamCount}`);
console.log(`   Players:  ${playerCount}`);
console.log(`   Events:   ${eventCount} (6 games + 6 training per team)`);
console.log(`   Rows:     ~${rows.length}`);
