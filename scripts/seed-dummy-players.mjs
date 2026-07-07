// node scripts/seed-dummy-players.mjs
// Seeds dummy tryout players so you can see the Team Builder in action.
// Safe to run multiple times — deletes all existing players for this club first.

const SUPABASE_URL = 'https://nandbuwogaxmrzsstttd.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbmRidXdvZ2F4bXJ6c3N0dHRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3MDI0MywiZXhwIjoyMDk3MTQ2MjQzfQ.E6uuet4_AhAY9PH8LS1_crFG11obwv04ohGpv-BZgDk';
const CLUB_ID      = 'cef06fa3-ab88-482b-9cfb-5d8069b8aaf9';
const SEASON       = '2026-27';

const H = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

// DOBs keyed to 2026-27 US Soccer season (Aug 1 cutoff)
// baseYear = seasonYear - U# → Aug baseYear … Jul (baseYear+1)
const DOBS = {
  U8:  ['2018-09-12','2018-11-05','2019-01-23','2019-03-14','2019-06-08','2018-10-30','2019-02-17','2018-08-22','2019-04-11','2019-07-01'],
  U9:  ['2017-09-18','2017-12-03','2018-02-14','2018-04-25','2018-07-09','2017-10-11','2018-01-30','2017-08-17','2018-03-22','2018-06-15'],
  U10: ['2016-09-07','2016-11-19','2017-01-08','2017-03-27','2017-06-14','2016-10-23','2017-02-05','2016-08-11','2017-04-18','2017-07-22'],
  U11: ['2015-09-20','2015-12-08','2016-02-24','2016-04-13','2016-07-06','2015-10-17','2016-01-09','2015-08-28','2016-03-31','2016-06-19'],
  U12: ['2014-09-15','2014-11-27','2015-01-18','2015-03-09','2015-06-25','2014-10-03','2015-02-12','2014-08-06','2015-04-28','2015-07-14'],
  U13: ['2013-09-10','2013-12-01','2014-02-20','2014-04-08','2014-07-17','2013-10-26','2014-01-14','2013-08-03','2014-03-29','2014-06-11'],
  U14: ['2012-09-25','2012-11-13','2013-01-04','2013-03-19','2013-06-30','2012-10-08','2013-02-27','2012-08-15','2013-04-06','2013-07-23'],
};
const GRADES = {
  U8: ['1st','2nd'], U9: ['2nd','3rd'], U10: ['3rd','4th'],
  U11: ['4th','5th'], U12: ['5th','6th'], U13: ['6th','7th'], U14: ['7th','8th'],
};

const BOYS_FIRST  = ['Mason','Liam','Noah','James','Ethan','Jack','Owen','Ryan','Connor','Dylan','Carter','Blake','Kyle','Aiden','Caleb','Hunter','Tyler','Logan','Gavin','Finn'];
const GIRLS_FIRST = ['Emma','Olivia','Ava','Sophia','Isabella','Mia','Charlotte','Amelia','Harper','Evelyn','Riley','Aria','Layla','Zoey','Lily','Claire','Nora','Lucy','Hannah','Grace'];
const LAST        = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Anderson','Taylor','Thomas','Moore','Jackson','Martin','White','Thompson','Harris','Lewis','Roberts','Walker','Hall','Allen','Young','King','Wright','Scott','Green','Baker'];
const POSITIONS   = ['GK','Defender','Midfielder','Forward','Not Sure'];
const STATUSES    = ['new','current','returning'];

function pick(arr, i) { return arr[i % arr.length]; }
function pickR(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function api(method, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── 1. Wipe existing dummy data ──────────────────────────────────────────────
console.log('🧹  Clearing existing tryout data for this club…');
await api('DELETE', `tryout_assignments?club_id=eq.${CLUB_ID}`);
await api('DELETE', `tryout_rankings?club_id=eq.${CLUB_ID}`);
await api('DELETE', `tryout_players?club_id=eq.${CLUB_ID}`);
console.log('    Done.');

// ── 2. Build player rows ─────────────────────────────────────────────────────
const players = [];
let nameIdx = 0;

for (const [ag, dobs] of Object.entries(DOBS)) {
  const grades = GRADES[ag];
  for (let i = 0; i < 10; i++) {
    const isBoy = i < 5;
    const firstName = isBoy ? BOYS_FIRST[nameIdx % BOYS_FIRST.length] : GIRLS_FIRST[nameIdx % GIRLS_FIRST.length];
    const lastName  = LAST[(nameIdx * 3 + i) % LAST.length];
    nameIdx++;
    players.push({
      club_id: CLUB_ID,
      season_label: SEASON,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dobs[i],
      grade: pick(grades, i),
      gender: isBoy ? 'Male' : 'Female',
      final_age_group: ag,
      positions: [pickR(POSITIONS)],
      maroons_status: pick(STATUSES, nameIdx),
      email_primary: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      parent_name: `${isBoy ? 'Michael' : 'Jennifer'} ${lastName}`,
      town: pickR(['Waldwick','Ridgewood','Ramsey','Ho-Ho-Kus','Allendale','Park Ridge','Westwood','Saddle River']),
      source: 'registration',
    });
  }
}

// ── 3. Insert players ────────────────────────────────────────────────────────
console.log(`\n⬆️   Inserting ${players.length} players…`);
const inserted = await api('POST', 'tryout_players', players);
console.log(`    Inserted ${inserted.length} players.`);

// ── 4. Build rankings (tryout_rank 1-10 per age-group cohort) ───────────────
console.log('\n📊  Inserting rankings…');
const rankings = inserted.map((p, idx) => {
  const rank = (idx % 10) + 1;  // 1-10 cycling within each age group batch
  const isNTR = rank === 10;    // last ranked player in each group = NTR
  return {
    club_id: CLUB_ID,
    player_id: p.id,
    tryout_rank: rank,
    coach_rank: rank <= 3 ? rank : null,
    tryout_status: isNTR ? 'NTR' : null,
    ranking_age_group: p.final_age_group,
  };
});
await api('POST', 'tryout_rankings', rankings);
console.log(`    Inserted ${rankings.length} rankings.`);

// ── 5. Build assignments ─────────────────────────────────────────────────────
// Most go to pool. A few to Test team with varying offer statuses. A few cut/declined.
console.log('\n🗂   Inserting assignments…');
const assignments = inserted.map((p, idx) => {
  let team = 'Unassigned';
  let status = 'Unassigned';
  let offer_status = 'NotSent';

  const slot = idx % 14;
  if (slot === 0) { team = 'Test'; status = 'Offer'; offer_status = 'Accepted'; }
  else if (slot === 1) { team = 'Test'; status = 'Offer'; offer_status = 'Sent'; }
  else if (slot === 2) { team = 'Test'; status = 'Offer'; offer_status = 'NotSent'; }
  else if (slot === 3) { team = 'Cut'; status = 'Rejected'; offer_status = 'NotSent'; }
  else if (slot === 4) { team = 'Declined'; status = 'Declined'; offer_status = 'Declined'; }

  return { club_id: CLUB_ID, player_id: p.id, team, status, offer_status };
});
await api('POST', 'tryout_assignments', assignments);
console.log(`    Inserted ${assignments.length} assignments.`);

// ── Summary ──────────────────────────────────────────────────────────────────
const pool     = assignments.filter(a => a.team === 'Unassigned').length;
const placed   = assignments.filter(a => a.team === 'Test').length;
const cut      = assignments.filter(a => a.team === 'Cut').length;
const declined = assignments.filter(a => a.team === 'Declined').length;

console.log(`
✅  Done!
   Total players : ${inserted.length}
   In pool       : ${pool}
   In Test team  : ${placed}  (${assignments.filter(a=>a.offer_status==='Accepted').length} Accepted, ${assignments.filter(a=>a.offer_status==='Sent').length} Resend, ${assignments.filter(a=>a.team==='Test'&&a.offer_status==='NotSent').length} Not Sent)
   Cut           : ${cut}
   Declined      : ${declined}
   NTR flagged   : ${rankings.filter(r=>r.tryout_status==='NTR').length}

Refresh the Team Builder to see the data.
`);
