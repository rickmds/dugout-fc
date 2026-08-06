import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json() as {
      text?: string;
      image_base64?: string;
      image_media_type?: string;
      known_fields?: string[];
    };

    const { text, image_base64, image_media_type, known_fields = [] } = body;

    if (!text && !image_base64) {
      return NextResponse.json({ error: 'text or image_base64 required' }, { status: 400 });
    }

    const fieldHint = known_fields.length
      ? `The club's known pitches are: ${known_fields.join(', ')}. Only use one of these names if the permit clearly refers to that exact pitch. If the permit is for a different facility or field name, keep the original name from the permit — do NOT rename it to a known pitch just because it sounds similar.`
      : '';

    const systemPrompt = `You are a field permit parser for a youth soccer club management system. Extract field availability windows from permit documents, booking contracts, and scheduling confirmations. ${fieldHint}

Return ONLY valid JSON — no markdown, no explanation, no preamble. Schema:
{
  "dates": [
    {
      "field_name": string,        // exact field/pitch name from the document
      "sub_zone": string | null,   // sub-zone if specified (e.g. "Zone A", "Pitch 1")
      "date": string,              // YYYY-MM-DD — the specific calendar date of this slot
      "from_time": string,         // HH:MM 24hr format
      "until_time": string,        // HH:MM 24hr format
      "label": string | null,      // short label, e.g. "Fall 2025", "MSC Games"
      "confidence": "high" | "medium" | "low"
    }
  ],
  "notes": string
}

Rules:
- Each specific date in the document gets its own entry — do NOT group by day-of-week
- Convert 12hr times to 24hr (e.g. 6:00pm → 18:00)
- For recurring weekly slots (e.g. "every Monday Sept–Dec 2025"): expand each individual Monday into a separate entry with its exact YYYY-MM-DD date. List every occurrence.
- Use the exact field name from the document, not a guess or alias
- Return ONLY the JSON object, nothing else`;

    const userContent: Anthropic.MessageParam['content'] = image_base64
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (image_media_type ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image_base64,
            },
          },
          {
            type: 'text',
            text: 'Extract all field availability windows from this permit/schedule document. Return JSON only.',
          },
        ]
      : `Extract all field availability windows from this permit/schedule document. Return JSON only.\n\n${text}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';

    // Extract JSON object robustly — find outermost { ... }
    const first = raw.indexOf('{');
    const last  = raw.lastIndexOf('}');
    const jsonStr = first !== -1 && last > first ? raw.slice(first, last + 1) : raw;

    let parsed: { dates: unknown[]; notes?: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 422 });
    }

    return NextResponse.json({ ok: true, ...parsed });
  } catch (e: any) {
    const msg = e?.error?.message ?? e?.message ?? String(e);
    console.error('/api/ai/parse-availability error:', msg, e);
    return NextResponse.json({ error: msg || 'AI request failed' }, { status: 500 });
  }
}
