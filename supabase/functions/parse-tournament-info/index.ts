import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: CORS });
  }

  // Back-compat: a lone {file_base64, file_type} is normalized into a
  // one-element files array so this remains a drop-in replacement.
  const body = await req.json();
  const files: { file_base64: string; file_type: string }[] =
    body.files ?? (body.file_base64 && body.file_type ? [{ file_base64: body.file_base64, file_type: body.file_type }] : []);
  if (!files.length) {
    return new Response(JSON.stringify({ error: 'files (or file_base64/file_type) required' }), { status: 400, headers: CORS });
  }

  const userContent: unknown[] = [];
  // Tracks which position in `imageCount` each pushed image block is at, so
  // the model's logo_image_index (0-based among IMAGE inputs only — PDFs
  // don't have a client-side pixel crop path) lines up with what the client
  // actually sent, regardless of any PDFs mixed into the same batch.
  let imageCount = 0;

  for (const { file_base64, file_type } of files) {
    if (file_type.startsWith('image/')) {
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const mediaType = validImageTypes.includes(file_type) ? file_type : 'image/jpeg';
      userContent.push({ type: 'text', text: `Image ${imageCount}:` });
      userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: file_base64 } });
      imageCount++;
    } else if (file_type === 'application/pdf') {
      userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file_base64 } });
    } else {
      const raw = atob(file_base64);
      userContent.push({ type: 'text', text: `Document text:\n\n${raw}` });
    }
  }

  // Deliberately much narrower than parse-schedule — this only extracts the
  // TOURNAMENT container's own metadata (name/venue/dates), not a game
  // list. A tournament flyer/announcement and the actual bracket/schedule
  // are often two different documents released at different times, so
  // importing games stays its own separate, already-built step.
  const multiple = files.length > 1;
  userContent.push({
    type: 'text',
    text: `Extract the soccer tournament's own identifying details from ${multiple ? `these ${files.length} documents (they may be several photos of the same flyer, multiple pages, or separate documents about the same tournament — treat them as one combined source)` : 'this document'} (a flyer, bracket header, schedule cover page, or registration confirmation). Return ONLY a valid JSON object — no markdown, no explanation.

Required structure:
{
  "name": "Jefferson Cup",
  "location": "Richmond Sportsplex",
  "address": "1600 Roseneath Rd, Richmond, VA 23230",
  "start_date": "2026-05-16",
  "end_date": "2026-05-18",
  "uncertain": false,
  "warnings": [],
  "logo_image_index": null,
  "logo_bbox": null
}

Field rules:
- name: the tournament's own name/title, e.g. "Jefferson Cup", "Region I Presidents Cup", "State Cup 2026". null if you genuinely cannot find one.
- location: venue/complex name only — no street address. null if not specified.
- address: a full street address if present (join separate Address/City/State/Zip parts into one string). null if not present.
- start_date / end_date: YYYY-MM-DD. If only one date is shown, set both to that same date. null for either if no date is present at all (e.g. a "you're invited to apply" announcement with no scheduled dates yet — don't guess).  If a year is absent, assume the next upcoming occurrence of that month/day.
- uncertain: true if the tournament name or dates are ambiguous or you have low confidence.
- warnings: array of strings for anything worth flagging (empty array if none).
- logo_image_index / logo_bbox: only if one of the numbered "Image N" inputs above clearly shows a standalone tournament/event logo, crest, or badge graphic (not a sponsor logo, not a full-page flyer background, not a generic soccer ball clipart). logo_image_index is that image's number (0-based, matching the "Image N:" labels — there is no valid index for a PDF/document input, only for numbered images). logo_bbox is {"x":0.0,"y":0.0,"width":0.0,"height":0.0}, each a fraction (0.0-1.0) of THAT image's own width/height, tightly bounding just the logo graphic with a little margin — not the whole page. Leave both null if no clear standalone logo is visible anywhere, or if you're not confident in the box.`,
  });

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 502, headers: CORS });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { uncertain: true, warnings: ['Could not parse AI response'] };
    } catch {
      parsed = { uncertain: true, warnings: ['Could not parse AI response'] };
    }
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
