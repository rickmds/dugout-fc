import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;
  try {
    const { prompt } = await req.json() as { prompt: string };
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    return NextResponse.json({ result });
  } catch (e) {
    console.error('/api/ai error', e);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
