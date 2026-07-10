import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are parsing a soccer roster document to extract player information.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Schema: {"players":[{"full_name":"string","jersey_number":"string or null","position":"string or null","parent_email":"string or null","team_name":"string or null","confidence":"high|medium|low"}]}
confidence: "high" = all fields clear, "medium" = some fields inferred, "low" = name uncertain or critical data missing.
position examples: "Goalkeeper","Defender","Midfielder","Forward","GK","CB","LB","RB","CM","CAM","CDM","LW","RW","ST","CF"
If a player belongs to a specific team (e.g. the document has multiple team sections), include team_name.
Extract ALL players you can find. Do not skip uncertain rows — flag them with confidence "low" instead.`;

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_MIMES: ImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function isImageMime(m: string): m is ImageMime { return IMAGE_MIMES.includes(m as ImageMime); }

export async function POST(req: NextRequest) {
  const body = await req.json() as { base64?: string; mimeType?: string; text?: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any[];

  if (body.text) {
    content = [{ type: 'text', text: `Extract all players from this roster:\n\n${body.text}` }];
  } else if (body.base64 && body.mimeType) {
    if (isImageMime(body.mimeType)) {
      content = [
        { type: 'image', source: { type: 'base64', media_type: body.mimeType, data: body.base64 } },
        { type: 'text', text: 'Extract all players from this roster.' },
      ];
    } else if (body.mimeType === 'application/pdf') {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.base64 } },
        { type: 'text', text: 'Extract all players from this roster.' },
      ];
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV, PDF, or an image.' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Provide base64+mimeType or text.' }, { status: 400 });
  }

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  const raw = (msg.content[0] as Anthropic.TextBlock).text ?? '';
  try {
    const parsed = JSON.parse(raw) as { players: unknown[] };
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI returned unparseable response', raw }, { status: 500 });
  }
}
