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

  const { file_base64, file_type } = await req.json();
  if (!file_base64 || !file_type) {
    return new Response(JSON.stringify({ error: 'file_base64 and file_type required' }), { status: 400, headers: CORS });
  }

  const userContent: unknown[] = [];

  if (file_type.startsWith('image/')) {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = validImageTypes.includes(file_type) ? file_type : 'image/jpeg';
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: file_base64 } });
  } else if (file_type === 'application/pdf') {
    userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file_base64 } });
  } else {
    const raw = atob(file_base64);
    userContent.push({ type: 'text', text: `Document text:\n\n${raw}` });
  }

  // Deliberately much narrower than parse-schedule — this only extracts the
  // TOURNAMENT container's own metadata (name/venue/dates), not a game
  // list. A tournament flyer/announcement and the actual bracket/schedule
  // are often two different documents released at different times, so
  // importing games stays its own separate, already-built step.
  userContent.push({
    type: 'text',
    text: `Extract the soccer tournament's own identifying details from this document (a flyer, bracket header, schedule cover page, or registration confirmation). Return ONLY a valid JSON object — no markdown, no explanation.

Required structure:
{
  "name": "Jefferson Cup",
  "location": "Richmond Sportsplex",
  "address": "1600 Roseneath Rd, Richmond, VA 23230",
  "start_date": "2026-05-16",
  "end_date": "2026-05-18",
  "uncertain": false,
  "warnings": []
}

Field rules:
- name: the tournament's own name/title, e.g. "Jefferson Cup", "Region I Presidents Cup", "State Cup 2026". null if you genuinely cannot find one.
- location: venue/complex name only — no street address. null if not specified.
- address: a full street address if present (join separate Address/City/State/Zip parts into one string). null if not present.
- start_date / end_date: YYYY-MM-DD. If only one date is shown, set both to that same date. null for either if no date is present at all (e.g. a "you're invited to apply" announcement with no scheduled dates yet — don't guess).  If a year is absent, assume the next upcoming occurrence of that month/day.
- uncertain: true if the tournament name or dates are ambiguous or you have low confidence.
- warnings: array of strings for anything worth flagging (empty array if none).`,
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
      max_tokens: 1024,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 502, headers: CORS });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { uncertain: true, warnings: ['Could not parse AI response'] };
    } catch {
      parsed = { uncertain: true, warnings: ['Could not parse AI response'] };
    }
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
