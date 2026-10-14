import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// IDP = Individual Development Plan. The coach writes the one thing that
// actually requires their own judgment — the performance goal itself —
// and this fills in the two things that are mostly mechanical once the
// goal is set: a concrete way to measure progress on it, and the specific
// actions a player should take between now and the next evaluation.
const SYSTEM = `You are a youth soccer coach writing an Individual Development Plan entry for a player.

You're given the player's context and a performance goal the coach has already written. Produce:
1. "measurables": one concrete, specific way to track progress toward this exact goal (a number, a frequency, or an observable outcome — not a vague restatement of the goal).
2. "action_items": exactly 3 specific, actionable steps the player can actually do (in training, in games, or on their own) to work toward the goal. Each one sentence, concrete, no filler.

Output ONLY a valid JSON object, no markdown fences, no explanation, in exactly this shape:
{"measurables": "...", "action_items": ["...", "...", "..."]}`;

type Body = {
  player_name: string;
  position: string;
  rating_technical: number;
  rating_tactical: number;
  rating_physical: number;
  rating_mental: number;
  areas_of_development: string[];
  goal: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  try {
    const body: Body = await req.json();
    if (!body.goal?.trim()) {
      return NextResponse.json({ error: 'A performance goal is required first' }, { status: 400 });
    }

    const devAreas = body.areas_of_development.filter(Boolean);

    const prompt = `Player: ${body.player_name}
Position: ${body.position || 'Not listed'}
Ratings — Technical: ${body.rating_technical}/5, Tactical: ${body.rating_tactical}/5, Physical: ${body.rating_physical}/5, Mental: ${body.rating_mental}/5
${devAreas.length ? `Areas of Development:\n${devAreas.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}
Performance Goal: ${body.goal}

Return the JSON now.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content.find(c => c.type === 'text')?.text ?? '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    let parsed: { measurables: string; action_items: string[] };
    try {
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('generate-idp error:', err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
