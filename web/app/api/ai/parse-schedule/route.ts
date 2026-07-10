import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are parsing a soccer schedule document to extract events.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Schema: {"events":[{"title":"string","type":"game|training|other","event_date":"YYYY-MM-DD or null","event_time":"HH:MM (24h) or null","location":"string or null","opponent":"string or null","team_name":"string or null","confidence":"high|medium|low"}]}
confidence: "high" = date+title clear, "medium" = some fields inferred, "low" = date missing or very uncertain.
type rules: if there is an opponent it is "game", regular sessions are "training", everything else is "other".
title: for games use "vs [Opponent]" if opponent known, otherwise use the raw title from the document.
event_date: always YYYY-MM-DD format. If only month+day given, infer the most likely year from context (current or upcoming season).
event_time: 24-hour HH:MM format. Convert "3:30 PM" to "15:30".
Extract ALL events. Do not skip uncertain ones — flag them with confidence "low".`;

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_MIMES: ImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function isImageMime(m: string): m is ImageMime { return IMAGE_MIMES.includes(m as ImageMime); }

export async function POST(req: NextRequest) {
  const body = await req.json() as { base64?: string; mimeType?: string; text?: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any[];

  if (body.text) {
    content = [{ type: 'text', text: `Extract all events from this schedule:\n\n${body.text}` }];
  } else if (body.base64 && body.mimeType) {
    if (isImageMime(body.mimeType)) {
      content = [
        { type: 'image', source: { type: 'base64', media_type: body.mimeType, data: body.base64 } },
        { type: 'text', text: 'Extract all events from this schedule.' },
      ];
    } else if (body.mimeType === 'application/pdf') {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.base64 } },
        { type: 'text', text: 'Extract all events from this schedule.' },
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
    const parsed = JSON.parse(raw) as { events: unknown[] };
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI returned unparseable response', raw }, { status: 500 });
  }
}
