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
  "logo_col_start": null,
  "logo_col_end": null,
  "logo_row_start": null,
  "logo_row_end": null
}

Field rules:
- name: the tournament's own name/title, e.g. "Jefferson Cup", "Region I Presidents Cup", "State Cup 2026". null if you genuinely cannot find one.
- location: venue/complex name only — no street address. null if not specified.
- address: a full street address if present (join separate Address/City/State/Zip parts into one string). null if not present.
- start_date / end_date: YYYY-MM-DD. If only one date is shown, set both to that same date. null for either if no date is present at all (e.g. a "you're invited to apply" announcement with no scheduled dates yet — don't guess).  If a year is absent, assume the next upcoming occurrence of that month/day.
- uncertain: true if the tournament name or dates are ambiguous or you have low confidence.
- warnings: array of strings for anything worth flagging (empty array if none).
- logo_image_index / logo_col_start / logo_col_end / logo_row_start / logo_row_end: only if one of the numbered "Image N" inputs above clearly shows a standalone tournament/event logo, crest, or badge graphic (not a sponsor logo, not surrounding page/app chrome like a nav bar or menu icon, not a generic soccer ball clipart). If the same logo appears more than once at different sizes (e.g. a large hero image and a small thumbnail copy of the same badge elsewhere on the page), always pick the LARGEST, clearest instance — never the small one.
  logo_image_index is that image's number (0-based, matching the "Image N:" labels — there is no valid index for a PDF/document input, only for numbered images).
  The box must bound ONLY the logo artwork itself (the shield/crest/badge shape, its text and icons) — never any surrounding white card, photo frame, rounded border, or padding it happens to sit inside. If the logo is displayed inside a bordered card with visible empty space around it, ignore that card entirely and locate just the graphic within it.
  To locate it, imagine that image divided into a grid of exactly 6 equal columns (numbered 1-6, left to right) and 10 equal rows (numbered 1-10, top to bottom). Give the column/row numbers of the grid cells the logo GRAPHIC's edges fall into: logo_col_start (leftmost column it touches), logo_col_end (rightmost column it touches), logo_row_start (topmost row it touches), logo_row_end (bottommost row it touches) — all integers 1-6 for columns, 1-10 for rows, with start <= end.
  Leave all five fields null if no clear standalone logo is visible anywhere, or if you're not confident in the grid cells.`,
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

  // Convert the model's grid-cell answer into the actual bbox fraction
  // ourselves, deterministically — asking the model to also do that
  // arithmetic (as an earlier version of this prompt did) was itself a
  // source of error on top of the cell estimate. Grid stays in lockstep
  // with the "6 columns x 10 rows" the prompt above describes.
  const GRID_COLS = 6, GRID_ROWS = 10;
  const colStart = Number(parsed.logo_col_start);
  const colEnd = Number(parsed.logo_col_end);
  const rowStart = Number(parsed.logo_row_start);
  const rowEnd = Number(parsed.logo_row_end);
  const cellsValid =
    Number.isInteger(colStart) && Number.isInteger(colEnd) && Number.isInteger(rowStart) && Number.isInteger(rowEnd) &&
    colStart >= 1 && colStart <= GRID_COLS && colEnd >= colStart && colEnd <= GRID_COLS &&
    rowStart >= 1 && rowStart <= GRID_ROWS && rowEnd >= rowStart && rowEnd <= GRID_ROWS;

  const result: Record<string, unknown> = {
    name: parsed.name ?? null,
    location: parsed.location ?? null,
    address: parsed.address ?? null,
    start_date: parsed.start_date ?? null,
    end_date: parsed.end_date ?? null,
    uncertain: parsed.uncertain ?? false,
    warnings: parsed.warnings ?? [],
    logo_image_index: null,
    logo_bbox: null,
  };
  if (cellsValid && Number.isInteger(Number(parsed.logo_image_index)) && Number(parsed.logo_image_index) >= 0) {
    result.logo_image_index = Number(parsed.logo_image_index);
    result.logo_bbox = {
      x: (colStart - 1) / GRID_COLS,
      y: (rowStart - 1) / GRID_ROWS,
      width: (colEnd - colStart + 1) / GRID_COLS,
      height: (rowEnd - rowStart + 1) / GRID_ROWS,
    };
  }

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
