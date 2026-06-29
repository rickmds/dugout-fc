import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TONE_DESC: Record<string, string> = {
  professional: 'formal and professional — clear, respectful, and to the point',
  friendly:     'warm and friendly — conversational, approachable, like a message from a trusted friend',
  urgent:       'direct and urgent — action is needed, time-sensitive, concise and clear',
  encouraging:  'positive and encouraging — upbeat, motivating, celebrating the team and their effort',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { bullets, tone, team_name, coach_name } = await req.json();

  if (!bullets?.trim()) {
    return new Response(JSON.stringify({ error: 'bullets is required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const toneDesc = TONE_DESC[tone] ?? TONE_DESC.professional;

  const prompt = `You are writing a parent communication email on behalf of a soccer coach.

Coach: ${coach_name ?? 'Coach'}
Team: ${team_name ?? 'the team'}
Tone: ${toneDesc}

The coach wants to communicate the following points:
${bullets}

Write a complete email:
1. Subject line — concise, max 10 words, no fluff
2. Body that:
   - Opens with "Hi parents,"
   - Covers ALL bullet points clearly and in order
   - Matches the specified tone throughout
   - Closes warmly and naturally (e.g. "See you out there!" or "Thanks for your support.")
   - Does NOT include a signature block — the coach adds that manually

Return ONLY valid JSON (no markdown, no code fences):
{"subject": "...", "body": "..."}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
