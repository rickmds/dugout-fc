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

You will be given a player's raw notes across four bullet sections (Super Strengths, Areas of Development, Outcome Goals, Performance Goals) and a set of ratings. Do two things:

1. Rewrite each non-empty bullet to be clearer and more specific, in a direct coach's voice — no filler phrases, no forced enthusiasm. Fix grammar and tighten wording. Do NOT change what a bullet means, do NOT invent new bullets, and do NOT fill in a bullet that was left blank — an empty input stays an empty output in that exact array position.
2. Write a personal summary paragraph, under 100 words, stating the specific strengths and the main development priority plainly from the (polished) points above. No headers, no bullet points, no markdown, no throat-clearing, no padded closing line.

Output ONLY a valid JSON object, no markdown fences, no explanation, in exactly this shape:
{
  "summary": "...",
  "super_strengths": ["...", "...", "..."],
  "areas_of_development": ["...", "...", "..."],
  "outcome_goals": ["...", "..."],
  "performance_goals": ["...", "..."]
}
Every array must have the same number of items as the input, in the same order, with blanks staying blank.`;

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

    const list = (items: string[]) =>
      items.map((s, i) => `${i + 1}. ${s || '(blank)'}`).join('\n');

    const prompt = `Player: ${body.player_name}
Position: ${body.position || 'Not listed'}
Season/Period: ${body.period_label} — ${body.season_label}

Ratings — Technical: ${body.rating_technical}/5, Tactical: ${body.rating_tactical}/5, Physical: ${body.rating_physical}/5, Mental: ${body.rating_mental}/5

Super Strengths:
${list(body.super_strengths)}

Areas of Development:
${list(body.areas_of_development)}

Outcome Goals:
${list(body.outcome_goals)}

Performance Goals this season:
${list(body.performance_goals)}

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
