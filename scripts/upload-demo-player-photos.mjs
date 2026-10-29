// node scripts/upload-demo-player-photos.mjs
//
// Downloads the 48 generated fictional roster headshots and uploads each to
// Supabase Storage (avatars bucket, same path convention the real app uses:
// players/{playerId}.jpg), then PATCHes players.photo_url. Pure upload +
// update against known player ids — no deletes.

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

const assignments = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-rickbreheny-Documents-dugout-fc/7106a02e-7f4b-4708-8332-bdcee3e16eb3/scratchpad/final_assignments.json', 'utf8'));

async function main() {
  let ok = 0;
  for (const [playerId, imageUrl] of assignments) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) { console.error(`download failed for ${playerId}: ${imgRes.status}`); continue; }
    const buf = await imgRes.arrayBuffer();

    const storagePath = `players/${playerId}.png`;
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${storagePath}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!upRes.ok) { console.error(`upload failed for ${playerId}: ${upRes.status} ${await upRes.text()}`); continue; }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${storagePath}?t=${Date.now()}`;
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${playerId}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ photo_url: publicUrl }),
    });
    if (!patchRes.ok) { console.error(`patch failed for ${playerId}: ${patchRes.status} ${await patchRes.text()}`); continue; }

    ok++;
    console.log(`  [${ok}/48] ${playerId} -> ${storagePath}`);
  }
  console.log(`\nDone: ${ok}/${assignments.length} players updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
