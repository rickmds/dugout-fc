// node scripts/seed-demo-club-extras.mjs
//
// Adds to the already-seeded Harbor City FC demo club (see seed-demo-club.mjs):
//   - coach-marked attendance on every past event for all 3 teams (fixes
//     the Team Pulse 0% card and populates Season Stats)
//   - a real public address/lat/lng on one upcoming event (satellite map demo)
//   - richer Team Chat threads on all 3 teams + a coach<->parent DM thread
//
// Pure inserts/updates against known, already-fetched row ids — no deletes.

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
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function sb(method, p, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ─── Known ids (read directly from the DB before this script was written) ──

const ADMIN_ID = 'c2ef9929-f7c3-47d4-a17d-e7f282aceff4';   // Alex Rivera, coach/org_admin
const PARENT_ID = '006505f5-af0f-4e1e-a553-030e416f968e';  // Dana Whitfield, parent

const TEAMS = {
  u10g: { id: '09d34979-026c-41f5-9e0d-ad4f6852474c', name: 'U10 Girls' },
  u12b: { id: 'ece6c7c2-eb63-4704-b324-2850166b0bfa', name: 'U12 Boys' },
  u14b: { id: '28f3aff5-4407-49b4-9ae8-deaf2d43a0d3', name: 'U14 Boys' },
};

const PLAYERS = {
  u10g: ['1c09fb91-75a9-4f74-a8cb-b75eac02fa5b','44095f35-7918-45a4-94c5-87992200f31e','54effafc-7138-46ac-bda8-5a6e788c1fee','7f3181bb-6bab-4a6f-b0ad-a9de0fd35655','baf12436-678a-442b-bdf0-fa16a156b121','95dafc51-5aef-4c29-8d03-d5fdef9fcfb3','46a5f4fd-6021-4d6b-841b-e982f1b1d3b8','3d688575-2d5e-46fb-8848-ea738bf01e65','7c9bad55-ff78-4b7c-adea-2787ddcfd048','d10c0620-2e57-442a-b949-006be0f62f4f','c694ee7c-79df-48d2-aa15-01abf559bb9e','9f7f5078-0816-4864-90e2-bcea3449e80c','0274fc86-81e3-420d-bbc6-134626433f20','ea0308b5-c2f8-40b6-88e5-0576a2400c45'],
  u12b: ['5b8050d2-e9a7-4273-a924-4accf46bc221','ac9f3447-e1dd-4d63-9556-5cc9628f0fb6','643f2dec-23f0-456c-a3a1-7982ddf95e0e','231acf6d-5f1c-4aee-aa4d-056ade795ea3','805bae9e-80c4-4c35-ae69-08c768ffb198','e116843a-5b32-4cd5-8254-40cf8772d16e','d42994a8-f00a-4084-8769-41f3676f7fdb','45349ebd-573d-48bb-97a7-2531ec7779e3','a3db75aa-f5c3-45d0-a000-b605742dd9f7','58bad585-4c8a-4423-8caf-f286dcae70f4','51f57478-30d3-413f-b92a-df7e790346a5','013b7ffc-0aab-42b6-b64a-9686aca2d51d','79f9f924-7b85-4aaf-a6e3-7d888723e146','6d5b5cf1-badf-4b42-b44f-cb303f42f74f','f2f4da07-bf12-4ede-bc44-40b52fbb87f9','6791db42-e046-4de4-a1fb-172f52a169c3'],
  u14b: ['4bc50b19-8325-4a8f-ae92-8b8ee03121ae','a0df6e2c-5129-4884-9775-939ed448195f','45e7b77e-54d7-4843-b802-bf8aae35e6b8','dabb4506-5585-4f75-ae1b-d71bdec89f40','6715a6f6-cca0-4c50-9c18-035da6a7b7f1','adc07827-244a-4e6a-8b3a-d4c77c60a3c7','ec8fbc63-c216-4a58-a3cb-519f773e9879','7bee67e0-d409-4b83-8262-f431641fc15e','7fb9c59a-d524-4524-8b38-2232fa5a07a5','d9a90309-1eec-4b11-a3a6-eba145e17b27','7031cdca-637a-4453-b155-4245393652d0','79043af7-6a70-436d-9c88-2a42d521357f','d111159f-2648-4c28-8808-118ae51835e0','48fb2cbe-ee9e-4bf7-a5aa-eff917a914a7','2c445056-f7e1-4607-948f-e35d2e0b2d49','23b45881-05dd-4250-b019-ad2ee4abe813','8fd100bf-c8ea-4f9e-a1ca-6e90c009eb42','83fb5196-d939-4815-a962-218a346956fb'],
};

// Past events only (event_date < 2026-10-29 "today") for each team.
const PAST_EVENTS = {
  u10g: ['63fd192e-0806-47ce-9e5b-23fafcec75a4','c7eb033a-5ca4-4818-a1a0-ca1db35c1b72','c389a74c-6cca-4213-a76c-fbdc8c25435a','e35a6509-4f9a-420f-9b48-f50434dfb275','c355e108-547e-4b98-a64c-4b94f9e75cdb','3e37de73-5825-415c-9f7a-9aa3c121ff47','934efda3-679e-40c6-8dbe-9dea2c11de96','2fff965a-5c2b-42a7-8645-7a0f0a123dcf','a058cd18-e3a0-4e78-bceb-ce40a38aeba4','1a3f85e0-e52d-4264-a1b1-595293173904'],
  u12b: ['7e6413de-a1f7-4aa4-a99b-15ccecf47bf6','32c5ab68-7bee-47d8-82b8-0e19e93bf4d9','ff4a7e54-d8b8-4999-add2-0c7ec7936446','12c4412b-adf8-4576-9068-e8e65edef24d','24cb138d-e070-410c-bc47-e54862c193bf','a9a14cad-a958-4dee-a9b4-8dd5fbab21cb','60259b4c-1e84-49ea-99f0-17a362f5917b','10e4ccbf-cba2-448a-a5d7-21cce7abbba8','ae7f8854-945e-481a-a37d-07ec4aae26c0'],
  u14b: ['d246ec78-a021-4635-8888-2cb0dd7cdff5','de2ffe52-ff3d-4be8-928b-89fb841d6983','23c81f45-e7a4-408e-91f2-833bd362257b','f821fcaf-be56-451b-b95f-9582c41710b8','656da40b-ff17-4da6-a1b4-bdcfe51d62b7','f4245aa6-91bf-4c1b-af0f-fd6292069479','934604cf-4332-47b7-90fc-527c77eadd40','b088a878-cb53-4a9b-9df1-ad8b81147c75','e05595dc-3472-488e-8ab0-72a86f0a75bf'],
};

let _seed = 11;
function rand(min, max) { _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff; return min + (_seed % (max - min + 1)); }

function statusFor() {
  const r = rand(0, 99);
  if (r < 84) return 'present';
  if (r < 94) return 'absent';
  return 'late';
}

async function main() {
  console.log('Adding attendance, map address, and chat/DMs to Harbor City FC...\n');

  // 1. Attendance for every past event, every team
  for (const key of Object.keys(TEAMS)) {
    const rows = [];
    for (const eventId of PAST_EVENTS[key]) {
      for (const playerId of PLAYERS[key]) {
        rows.push({ event_id: eventId, player_id: playerId, status: statusFor(), marked_by: ADMIN_ID });
      }
    }
    await sb('POST', '/event_attendance', rows);
    console.log(`  ${TEAMS[key].name.padEnd(12)} -> attendance marked on ${PAST_EVENTS[key].length} events (${rows.length} rows)`);
  }

  // 2. Real public address on the next U12 Boys game so the satellite map renders
  //    World Wide Technology Soccer Park — a real, public multi-field soccer complex.
  await sb('PATCH', '/events?id=eq.f1f8b439-3ed4-49a5-9bd9-3c026c59cc32', {
    location: 'World Wide Technology Soccer Park',
    address: '1 Soccer Park Rd, St. Louis, MO 63109',
    lat: 38.5496,
    lng: -90.3425,
  });
  console.log('  U12 Boys       -> real address set on next game (satellite map will render)');

  // 3. Team Chat: more messages on U12 Boys, plus new threads for U10 Girls / U14 Boys
  const [u10convo] = await sb('POST', '/conversations', { team_id: TEAMS.u10g.id, type: 'team_group' });
  await sb('POST', '/conversation_participants', [{ conversation_id: u10convo.id, profile_id: ADMIN_ID }, { conversation_id: u10convo.id, profile_id: PARENT_ID }]);
  await sb('POST', '/messages', [
    { conversation_id: u10convo.id, sender_id: ADMIN_ID, body: 'Great session today, girls worked hard on finishing!' },
    { conversation_id: u10convo.id, sender_id: PARENT_ID, body: "Zoey came home exhausted, in a good way! Thanks coach." },
    { conversation_id: u10convo.id, sender_id: ADMIN_ID, body: "Quick reminder — Friday's game is at Briar Creek, 15 min earlier than usual." },
  ]);

  const [u14convo] = await sb('POST', '/conversations', { team_id: TEAMS.u14b.id, type: 'team_group' });
  await sb('POST', '/conversation_participants', [{ conversation_id: u14convo.id, profile_id: ADMIN_ID }]);
  await sb('POST', '/messages', [
    { conversation_id: u14convo.id, sender_id: ADMIN_ID, body: 'Nice response from the boys after going down early on Saturday — proud of that comeback.' },
    { conversation_id: u14convo.id, sender_id: ADMIN_ID, body: 'Training moved indoors this Thursday, forecast looks rough.' },
  ]);

  // More U12 Boys team chat messages (append to the thread already seeded)
  const u12rows = await sb('GET', `/conversations?team_id=eq.${TEAMS.u12b.id}&type=eq.team_group&select=id`);
  const u12convo = u12rows?.[0];
  if (u12convo) {
    await sb('POST', '/messages', [
      { conversation_id: u12convo.id, sender_id: PARENT_ID, body: 'Does anyone have an extra shin guard Jack could borrow Saturday? Forgot his at home last week, want a spare in the bag.' },
      { conversation_id: u12convo.id, sender_id: ADMIN_ID, body: "I'll bring a spare set, don't worry about it." },
      { conversation_id: u12convo.id, sender_id: PARENT_ID, body: "You're the best, thank you!" },
    ]);
  }
  console.log('  Team chat threads seeded on all 3 teams.');

  // 4. A coach <-> parent DM thread
  const [dm] = await sb('POST', '/conversations', { type: 'direct', team_id: null });
  await sb('POST', '/conversation_participants', [{ conversation_id: dm.id, profile_id: ADMIN_ID }, { conversation_id: dm.id, profile_id: PARENT_ID }]);
  await sb('POST', '/messages', [
    { conversation_id: dm.id, sender_id: PARENT_ID, body: "Hi Alex, quick one — Jack's going to miss Thursday training, we've got a dentist appointment that ran long last time and this one's booked for the same slot." },
    { conversation_id: dm.id, sender_id: ADMIN_ID, body: 'No problem at all, thanks for the heads up. Hope the appointment goes smoothly!' },
    { conversation_id: dm.id, sender_id: PARENT_ID, body: "Appreciate it. He'll be there Saturday for the game either way." },
    { conversation_id: dm.id, sender_id: ADMIN_ID, body: "Sounds good, see him then." },
  ]);
  console.log('  Coach <-> parent DM thread seeded.');

  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
