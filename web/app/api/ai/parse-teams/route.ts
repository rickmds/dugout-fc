import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are parsing a soccer club document to extract team information.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Schema: {"teams":[{"name":"string","age_group":"string or null","gender":"string or null","confidence":"high|medium|low"}]}
confidence: "high" = clearly stated, "medium" = inferred from context, "low" = uncertain or missing data.
age_group examples: "U8","U9","U10","U11","U12","U13","U14","U15","U16","U17","U18","U19","Adult"
gender: "Boys","Girls","Mixed", or null if unknown.`;

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_MIMES: ImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function isImageMime(m: string): m is ImageMime { return IMAGE_MIMES.includes(m as ImageMime); }

export async function POST(req: NextRequest) {
  const body = await req.json() as { base64?: string; mimeType?: string; text?: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any[];

  if (body.text) {
    content = [{ type: 'text', text: `Extract all teams from this document:\n\n${body.text}` }];
  } else if (body.base64 && body.mimeType) {
    if (isImageMime(body.mimeType)) {
      content = [
        { type: 'image', source: { type: 'base64', media_type: body.mimeType, data: body.base64 } },
        { type: 'text', text: 'Extract all teams from this document.' },
      ];
    } else if (body.mimeType === 'application/pdf') {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.base64 } },
        { type: 'text', text: 'Extract all teams from this document.' },
      ];
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV, PDF, or an image.' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Provide base64+mimeType or text.' }, { status: 400 });
  }

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  const raw = (msg.content[0] as Anthropic.TextBlock).text ?? '';
  try {
    const parsed = JSON.parse(raw) as { teams: unknown[] };
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI returned unparseable response', raw }, { status: 500 });
  }
}
