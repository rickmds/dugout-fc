import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { starters, subs, game_length, halves } = await req.json();

  if (!starters?.length || !subs?.length) {
    return new Response(JSON.stringify({ error: 'starters and subs are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Pre-compute equal-time maths so the AI only handles positional matching ──

  const pitchPlayers     = starters.length;          // spots on the pitch
  const totalSquad       = starters.length + subs.length;
  const totalPitchMins   = game_length * pitchPlayers; // total player-minutes available
  const targetMins       = Math.round(totalPitchMins / totalSquad); // each player's fair share
  const halfLength       = Math.round(game_length / halves);

  // Each sub plays targetMins → comes on at game_length - targetMins
  const subOnMinute = game_length - targetMins;

  // If multiple subs can't all come on at the same time, stagger them
  // We space them so each starter (who gets subbed) plays at most targetMins
  // Stagger window: spread across max(subOnMinute - 5, half_length) to avoid bunching
  const subCount      = subs.length;
  const spreadStart   = Math.max(5, subOnMinute - Math.floor(subCount * 5 / 2));
  const spreadEnd     = Math.min(game_length - 5, subOnMinute + Math.floor(subCount * 5 / 2));
  const subWindow     = `between minute ${spreadStart} and minute ${spreadEnd}`;

  const startersDesc = starters.map((p: any) =>
    `  ${p.full_name} — position: ${p.position ?? 'unknown'}`
  ).join('\n');

  const subsDesc = subs.map((p: any) =>
    `  ${p.full_name} — position: ${p.position ?? 'unknown'}`
  ).join('\n');

  const prompt = `You are an expert youth soccer coach assistant. Create a substitution plan for equal playing time.

GAME INFO:
- Total game length: ${game_length} minutes
- Halves: ${halves} × ${halfLength} minutes each
- Players on pitch: ${pitchPlayers}
- Total squad: ${totalSquad} (${starters.length} starters + ${subs.length} subs)

EQUAL-TIME CALCULATION (already done for you — do not change these numbers):
- Total player-minutes: ${totalPitchMins}
- Target minutes per player: ${targetMins} minutes
- Each substitute should come ON at approximately minute ${subOnMinute}
- Spread multiple subs ${subWindow} to avoid bringing everyone on at once

STARTING LINEUP:
${startersDesc}

SUBSTITUTES:
${subsDesc}

YOUR TASK — follow these rules exactly:

1. EQUAL TIME: Every substitute must play exactly ${targetMins} minutes (±2 min tolerance). Starters who get subbed off play ${game_length - targetMins} minutes.

2. POSITIONAL MATCH: Each substitute must replace a player in the SAME or very similar position:
   - GK → GK only. Never sub a GK for an outfield player or vice versa.
   - CB/LB/RB → replace with a defender of the same type where possible.
   - CM/DM/AM → replace with a midfielder. DM replaces DM, AM replaces AM, CM is flexible.
   - ST/CF/FW → replace with a forward.
   - LW/RW → replace with same wing or a forward.
   - If the exact position isn't available, use the closest defensive/midfield/attacking group.

3. GK RULE: Unless a GK is listed in the substitutes, do NOT rotate the goalkeeper. The GK plays the full game.

4. SPACING: Minimum 5 minutes between any two substitutions. Maximum 2 subs at the same minute.

5. HALVES: Prefer to make subs at the start of the second half (minute ${halfLength}) or after. Avoid subs in the first 10 minutes.

6. Every substitute in the list above must come on at least once.

Return ONLY valid JSON:
{
  "summary": "concise one-sentence description e.g. '${subCount} rolling subs at minute ${subOnMinute}, every player gets ${targetMins} minutes'",
  "target_minutes": ${targetMins},
  "subs": [
    { "minute": number, "player_off": "exact full name from starter list", "player_on": "exact full name from sub list", "note": "e.g. 'CM for CM'" }
  ],
  "playing_time": [
    { "name": "exact full name", "minutes": number }
  ]
}

The playing_time array must include EVERY player (all starters and all subs). Minutes must sum to ${totalPitchMins}.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const json  = await res.json();
  const raw   = json.content?.[0]?.text ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const parsed = JSON.parse(match[0]);
  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
