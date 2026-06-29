import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTRUCTIONS = `Extract all player roster entries from this data. Each row represents one player.

Normalize positions to: GK, CB, LB, RB, CM, DM, AM, LM, RM, LW, RW, ST. Use closest match or null.

Return ONLY valid JSON — no explanation, no markdown:
{
  "players": [
    {
      "full_name": "string — required",
      "jersey_number": 10,
      "position": "CM",
      "parent_email": "parent@example.com or null",
      "uncertain": false,
      "uncertainty_reason": null
    }
  ],
  "warnings": []
}

Rules:
- full_name: required. Combine first/last name columns if split.
- jersey_number: integer or null.
- position: normalized abbreviation or null.
- parent_email: any email for a parent/guardian. null if not present.
- uncertain: true if any required field is ambiguous.
- uncertainty_reason: brief explanation if uncertain, null otherwise.
- warnings: array of strings for general parsing issues.
- Skip rows that are headers or completely blank.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: CORS });
  }

  const { file_base64, file_type } = await req.json();
  if (!file_base64 || !file_type) {
    return new Response(JSON.stringify({ error: 'file_base64 and file_type required' }), { status: 400, headers: CORS });
  }

  const isPdf = file_type === 'application/pdf' || file_type.includes('pdf');
  const isExcel = file_type.includes('spreadsheetml') || file_type.includes('ms-excel');

  let messageContent: unknown[];

  if (isPdf) {
    messageContent = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: file_base64 },
      },
      { type: 'text', text: INSTRUCTIONS },
    ];
  } else if (isExcel) {
    let csvText: string;
    try {
      const workbook = XLSX.read(file_base64, { type: 'base64' });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) parts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      csvText = parts.join('\n\n');
    } catch (e) {
      return new Response(JSON.stringify({ error: `Could not read Excel file: ${e}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    messageContent = [{ type: 'text', text: `${INSTRUCTIONS}\n\nSpreadsheet content:\n${csvText}` }];
  } else {
    const raw = atob(file_base64);
    messageContent = [{ type: 'text', text: `${INSTRUCTIONS}\n\nSpreadsheet content:\n${raw}` }];
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 502, headers: CORS });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: { players: unknown[]; warnings: string[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { players: [], warnings: ['Could not parse AI response'] };
    } catch {
      parsed = { players: [], warnings: ['Could not parse AI response'] };
    }
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
