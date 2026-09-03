import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a youth soccer coach writing a personal summary paragraph for a player development report.
Write in a direct, specific tone — specific to this player, never generic. No filler phrases, no forced enthusiasm.
Output ONLY the paragraph. No headers, no bullet points, no markdown. Under 100 words.
State the specific strengths and the main development priority plainly. No throat-clearing, no padded closing line.`;

type Body = {
  player_name: string;
  position: string;
  school: string;
  season_label: string;
  period_label: string;
  rating_technical: number;
  rating_tactical: number;
  rating_physical: number;
  rating_mental: number;
  super_strengths: string[];
  areas_of_development: string[];
  performance_goals: string[];
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  try {
    const body: Body = await req.json();

    const list = (items: string[]) =>
      items.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Not specified';

    const prompt = `Player: ${body.player_name}
Position: ${body.position || 'Not listed'}
School: ${body.school || 'Not listed'}
Season/Period: ${body.period_label} — ${body.season_label}

Ratings — Technical: ${body.rating_technical}/5, Tactical: ${body.rating_tactical}/5, Physical: ${body.rating_physical}/5, Mental: ${body.rating_mental}/5

Super Strengths:
${list(body.super_strengths)}

Areas of Development:
${list(body.areas_of_development)}

Performance Goals this season:
${list(body.performance_goals)}

Write the coach summary now.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content.find(c => c.type === 'text')?.text ?? '';
    return NextResponse.json({ text });
  } catch (err) {
    console.error('generate-evaluation error:', err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
