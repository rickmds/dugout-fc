import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Does two things in one pass: tightens whatever the coach typed into the
// four bullet sections (never inventing new points, never changing what a
// bullet means — just clearer, more specific wording), and writes the
// summary paragraph from the polished version. One combined call instead
// of a separate "polish" step per section, so a coach gets both from the
// one button they already know ("Generate Coach Summary").
const SYSTEM = `You are a youth soccer coach preparing a player development report.

You will be given a player's raw notes as four JSON arrays (super_strengths, areas_of_development, outcome_goals, performance_goals) and a set of ratings. Do two things:

1. Rewrite every non-empty bullet in each array — do not just lightly touch it up, actually sharpen it into a specific, direct coach's line, max 12 words. Fix grammar, cut filler words, replace vague phrasing ("works hard", "needs to improve") with something concrete and specific to this player's position and ratings. Only leave a bullet nearly as-is if it is already that sharp. Never change what a bullet actually means, never invent a new bullet, and never fill in a bullet that was an empty string — an empty string stays an empty string in that exact array position.
2. Write a personal summary paragraph, under 100 words, stating the specific strengths and the main development priority plainly from the (now-polished) points above. No headers, no bullet points, no markdown, no throat-clearing, no padded closing line.

Output ONLY a valid JSON object, no markdown fences, no explanation, in exactly this shape:
{
  "summary": "...",
  "super_strengths": ["...", "...", "..."],
  "areas_of_development": ["...", "...", "..."],
  "outcome_goals": ["...", "..."],
  "performance_goals": ["...", "..."]
}
Every array must have exactly the same number of items as the matching input array, in the same order.`;

type Body = {
  player_name: string;
  position: string;
  season_label: string;
  period_label: string;
  rating_technical: number;
  rating_tactical: number;
  rating_physical: number;
  rating_mental: number;
  super_strengths: string[];
  areas_of_development: string[];
  outcome_goals: string[];
  performance_goals: string[];
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  try {
    const body: Body = await req.json();

    const prompt = `Player: ${body.player_name}
Position: ${body.position || 'Not listed'}
Season/Period: ${body.period_label} — ${body.season_label}

Ratings — Technical: ${body.rating_technical}/5, Tactical: ${body.rating_tactical}/5, Physical: ${body.rating_physical}/5, Mental: ${body.rating_mental}/5

super_strengths: ${JSON.stringify(body.super_strengths)}
areas_of_development: ${JSON.stringify(body.areas_of_development)}
outcome_goals: ${JSON.stringify(body.outcome_goals)}
performance_goals: ${JSON.stringify(body.performance_goals)}

Return the JSON now.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content.find(c => c.type === 'text')?.text ?? '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    let parsed: {
      summary: string;
      super_strengths: string[];
      areas_of_development: string[];
      outcome_goals: string[];
      performance_goals: string[];
    };
    try {
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('generate-evaluation error:', err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
