import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a youth soccer coach writing a personal player evaluation report for a parent and their child.
Write in a warm, professional, encouraging tone — specific enough to feel genuine, never generic.
Output ONLY the report text, no headers, no bullet points, no markdown. 150–180 words maximum.
Focus on concrete observations: what the player did well, one clear area to develop, and an encouraging closing message.`;

type Body = {
  player_name: string;
  season_label: string;
  period_label: string;
  rating_technical: number;
  rating_tactical: number;
  rating_physical: number;
  rating_mental: number;
  q1_improvement: string;
  q2_focus: string;
  q3_message: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();

    const ratings = [
      `Technical: ${body.rating_technical}/5`,
      `Tactical: ${body.rating_tactical}/5`,
      `Physical: ${body.rating_physical}/5`,
      `Mental/attitude: ${body.rating_mental}/5`,
    ].join(', ');

    const prompt = `Player: ${body.player_name}
Season: ${body.season_label} — ${body.period_label}
Ratings — ${ratings}

Coach notes:
1. Biggest improvement this period: ${body.q1_improvement}
2. Main area to focus on next: ${body.q2_focus}
3. Personal message to player and family: ${body.q3_message}

Write the player evaluation report now.`;

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
