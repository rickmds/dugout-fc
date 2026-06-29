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

  let file_base64: string, file_type: string, existing_teams: { id: string; name: string }[] = [];
  try {
    ({ file_base64, file_type, existing_teams = [] } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!file_base64 || !file_type) {
    return new Response(JSON.stringify({ error: 'file_base64 and file_type required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const raw = atob(file_base64);

  const teamList = existing_teams.map((t) => `- "${t.name}"`).join('\n');

  const prompt = `You are parsing a soccer league schedule that contains events for multiple teams.

Teams in this club:
${teamList || '(none provided)'}

Schedule content:
${raw}

Your job:
1. Identify every event in the schedule — games, training sessions, tournaments, etc.
2. Determine which team each event belongs to. Look for team names in: section headers, a "Team" column, page titles, or repeated labels.
3. Match each team from the schedule to the closest name in the club list above. Use fuzzy matching — "U12 Boys" should match "U12 Boys A" if that's the closest option. The matched team_name MUST be one of the names from the club list.
4. If you cannot confidently match a team name to any club team, put those events in unmatched_events with the raw team name found in the file.
5. Set uncertain=true on a team_events entry if the team match was a guess rather than a clear match.

For each event extract:
- date: YYYY-MM-DD or null
- time: HH:MM 24-hour or null
- title: opponent name CLEANED and human-readable, always prefix with "vs". League schedules often encode opponent names as "ClubName-DivisionCode-CoachLastName" — strip division codes (B8A, G14, U12 etc.) and coach last names, then reformat CamelCase to spaced Title Case words. Examples: "RidgewoodSC-B8-Smith" → "vs Ridgewood SC", "MaplewoodYouthSoccer-B12A-Flynn" → "vs Maplewood Youth Soccer", "BergenShieldsFC-B12A-Park" → "vs Bergen Shields FC", "WestfieldYSA-B8A-Jones" → "vs Westfield YSA". For non-game events use a natural name like "Training" or "Tournament"
- type: "game", "training", or "other"
- location: venue or field name, or null
- address: full street address if present, or null
- home_away: "home", "away", or null
- surface: "turf", "grass", or null
- uncertain: true if date/time is ambiguous or details are unclear
- uncertainty_reason: short explanation or null

Return ONLY valid JSON, no explanation or markdown:
{
  "team_events": [
    {
      "team_name": "U12 Boys A",
      "uncertain": false,
      "events": [
        {
          "date": "2026-08-15",
          "time": "10:00",
          "title": "vs Red Hawks",
          "type": "game",
          "location": "Habernickel Park",
          "address": "123 Main St, Springfield NJ 07081",
          "home_away": "home",
          "surface": "turf",
          "uncertain": false,
          "uncertainty_reason": null
        }
      ]
    }
  ],
  "unmatched_events": [
    {
      "date": "2026-09-03",
      "time": "14:00",
      "title": "vs FC United",
      "type": "game",
      "location": null,
      "address": null,
      "home_away": null,
      "surface": null,
      "raw_team_name": "U10 Mixed",
      "uncertainty_reason": "Team 'U10 Mixed' not found in club"
    }
  ],
  "warnings": []
}

Rules:
- team_name in team_events must exactly match one of the provided club team names.
- If you can't match a team, use unmatched_events — never invent a team name.
- Skip blank rows and column headers.
- Do not invent addresses or locations.`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { team_events: [], unmatched_events: [], warnings: [`AI response could not be parsed. Response length: ${rawText.length} chars`] };
    } catch {
      parsed = { team_events: [], unmatched_events: [], warnings: [`AI response truncated or malformed. Response length: ${rawText.length} chars`] };
    }
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
