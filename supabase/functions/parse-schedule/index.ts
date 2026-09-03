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

  const { file_base64, file_type, context } = await req.json();
  if (!file_base64 || !file_type) {
    return new Response(JSON.stringify({ error: 'file_base64 and file_type required' }), { status: 400, headers: CORS });
  }
  const isTournament = context === 'tournament';

  // Build content array based on file type
  const userContent: unknown[] = [];

  if (file_type.startsWith('image/')) {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = validImageTypes.includes(file_type) ? file_type : 'image/jpeg';
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: file_base64 } });
  } else if (file_type === 'application/pdf') {
    userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file_base64 } });
  } else {
    // CSV / plain text — decode base64 to raw text
    const raw = atob(file_base64);
    userContent.push({ type: 'text', text: `Schedule data:\n\n${raw}` });
  }

  const tournamentPreamble = isTournament
    ? `This is a TOURNAMENT schedule (weekend pool play / bracket, or a single knockout round) — not a regular season schedule. Expect: multiple games in one or two days, a court/field NUMBER rather than a full street address, and opponents that may only be knowable after pool play (e.g. "Winner of Pool A", "TBD"). Extract round_label for every game.\n\n`
    : '';

  const roundLabelRule = isTournament
    ? `- round_label: the pool/bracket stage this game belongs to, e.g. "Pool Play", "Group A", "Round of 16", "Quarterfinal", "Semifinal", "Final". Use the document's own wording where possible, normalized to a short human-readable label (e.g. "QF" -> "Quarterfinal"). null only if genuinely not indicated anywhere.`
    : `- round_label: null unless this document explicitly shows tournament/bracket round structure (e.g. "Quarterfinal", "Pool Play") — for a normal season schedule this is always null.`;

  userContent.push({
    type: 'text',
    text: `${tournamentPreamble}Extract all soccer schedule events from this document. Return ONLY a valid JSON object — no markdown, no explanation.

Required structure:
{
  "events": [
    {
      "date": "2026-08-15",
      "time": "10:00",
      "title": "vs FC Dallas",
      "type": "game",
      "location": "Home Field",
      "address": "123 Main St, Springfield, NJ 07081",
      "home_away": "home",
      "surface": "turf",
      "round_label": null,
      "uncertain": false,
      "uncertainty_reason": null
    }
  ],
  "warnings": []
}

Field rules:
- date: YYYY-MM-DD. null if you cannot determine it confidently. If year is absent, assume the next upcoming year.
- time: 24-hour HH:MM (24-hour format). null if not specified.
- title: For home games use "vs [Cleaned Opponent]". For away games use "@ [Cleaned Opponent]". For training use "Training" or "Practice". For other events use a brief label. Do NOT append "(Home)" or "(Away)" to the title.${isTournament ? ' If the document itself gives a placeholder for a not-yet-determined opponent (e.g. "Winner of Pool A"), use that verbatim as "vs Winner of Pool A". Never use round/stage wording ("Pool Play", "Group A", "Round of 16", etc.) as the opponent or title — that belongs in round_label only. If no opponent is identifiable at all, leave title null, set uncertain: true, and explain why in uncertainty_reason — do not invent placeholder text like "vs TBD".' : ''}
- Cleaned Opponent: strip division codes, season codes, coach names, and club suffixes from team names. E.g. "FairLawnAllSports-B12A-Rake" → "Fair Lawn All Sports", "Tenafly-B12A-Schwartzberg" → "Tenafly", "CougarSC-B12A-Kolodiy" → "Cougar SC", "Montclair-B12A-Brown" → "Montclair". Make it human-readable.
- home_away: "home" if the team this schedule belongs to is the Home Team column, "away" if they are the Visitor Team. To identify which team the schedule is for: find the team name that recurs consistently across rows (appearing in Home Team for some rows and Visitor Team for others — it is the same club throughout). null if not applicable (training, other${isTournament ? ', or a neutral-site tournament game with no designated home team' : ''}).
- type: "game" if there is a home team vs visitor team structure, "training" for practice/training/conditioning, "other" for everything else.
- location: field or venue name only — no address.${isTournament ? ' For a tournament, this is often just a court/field number (e.g. "Field 3", "Court 12") rather than a named venue — use whatever the document gives.' : ''} null if not specified.
- address: join any separate address component columns (Address, City, State, Zipcode) into one string like "230 Northern Pkwy, Ridgewood, NJ 07450". If already combined, use as-is. null if no address present.
- surface: "turf" if Artificial/Turf/Synthetic/FieldTurf; "grass" if Grass/Natural. null if not specified.
${roundLabelRule}
- uncertain: true if the date is ambiguous, row is unclear, or you lack confidence in any required field.
- uncertainty_reason: brief explanation when uncertain, null otherwise.
- warnings: array of strings for general parsing issues (empty array if none).`,
  });

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 502, headers: CORS });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: { events: unknown[]; warnings: string[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { events: [], warnings: ['Could not parse AI response'] };
    } catch {
      parsed = { events: [], warnings: ['Could not parse AI response'] };
    }
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
