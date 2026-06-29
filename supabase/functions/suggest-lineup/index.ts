import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: CORS });
  }

  const { players, formation, positions, team_name } = await req.json();

  const slots: Array<{ label: string; x: number; y: number }> = positions ?? [];
  if (!slots.length) {
    return new Response(JSON.stringify({ error: 'No formation positions provided' }), { status: 400, headers: CORS });
  }

  const attending = (players as any[]).filter((p) => p.rsvp_status === 'attending');
  if (attending.length < 3) {
    return new Response(JSON.stringify({ error: 'Need at least 3 confirmed players to suggest a lineup.' }), { status: 400, headers: CORS });
  }

  const slotsDesc  = slots.map((s, i) => `  Slot ${i}: ${s.label}`).join('\n');
  const playersDesc = attending.map((p: any) =>
    `  id: ${p.id} | name: ${p.full_name} | position: ${p.position ?? 'none'} | jersey: #${p.jersey_number ?? '?'}`
  ).join('\n');

  const fillCount = Math.min(attending.length, slots.length);

  const prompt = `You are an expert soccer coach assistant building a lineup for ${team_name ?? 'a team'}.

Formation: ${formation}

FORMATION SLOTS (fill ${fillCount} of ${slots.length}):
${slotsDesc}

AVAILABLE PLAYERS (confirmed attending, ${attending.length} total):
${playersDesc}

POSITION MATCHING RULES — follow these strictly, in priority order:

1. GOALKEEPER (GK slot):
   - ONLY assign a player whose position is "GK".
   - Never place an outfield player in goal, even if the slot is unfilled.
   - If no GK is available, leave the GK slot empty.

2. DEFENDERS (CB, LB, RB, WB, SW slots):
   - CB slot → prefer CB. Accept LB or RB only if no CB is available.
   - LB slot → prefer LB. If no LB, use CB or WB. NEVER put an RB in the LB slot.
   - RB slot → prefer RB. If no RB, use CB or WB. NEVER put an LB in the RB slot.
   - WB slots follow the same left/right rule: LWB stays left, RWB stays right.
   - Never put a midfielder or forward in a defender slot if any defender is available.

3. MIDFIELDERS (CM, DM, CDM, AM, CAM, RM, LM slots):
   - DM/CDM slots → prefer DM, CDM, CM players.
   - CM slots → prefer CM. Accept DM or AM.
   - AM/CAM slots → prefer AM, CAM. Accept CM.
   - LM/RM slots → prefer LM/RM, LW/RW, then CM.

4. FORWARDS & WINGERS (ST, CF, FW, LW, RW slots):
   - ST/CF/FW slots → prefer ST, CF, FW.
   - LW slot → prefer LW, LM. Accept ST.
   - RW slot → prefer RW, RM. Accept ST.
   - Never place a defender or GK in an attacking slot.

5. Players with no position or "any":
   - Fill them into whatever slot remains after positional players are assigned.

6. If there are fewer players than slots:
   - Leave attacking/winger slots empty before leaving defensive/GK slots empty.
   - The GK slot must have a GK or be left empty — never fill it with a non-GK.

Assign exactly ${fillCount} players. Each player appears at most once. Return ONLY valid JSON:
{
  "assignments": [
    { "slot_index": 0, "player_id": "uuid-here" }
  ]
}`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 502, headers: CORS });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: { assignments: Array<{ slot_index: number; player_id: string }> };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { assignments: [] };
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse AI response' }), { status: 500, headers: CORS });
    }
  }

  const positions_out = (parsed.assignments ?? []).map((a) => {
    const slot = slots[a.slot_index];
    if (!slot) return null;
    return { player_id: a.player_id, position_label: slot.label, x: slot.x, y: slot.y };
  }).filter(Boolean);

  return new Response(JSON.stringify({ positions: positions_out }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
