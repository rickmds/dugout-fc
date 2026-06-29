import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTRUCTIONS = (existingTeams: string[]) => `You are parsing a soccer club management document. It may contain multiple teams, coaches, and players.

Your job:
1. Identify all distinct teams. Teams may be grouped by a "Team" column, section headers, repeated team names, or any other pattern.
2. For each team, extract all coaches/staff (role indicates coach, manager, or staff).
3. For each team, extract all players (role indicates player, or player-like fields with no role).
4. Detect age group (e.g. "U12", "U14 Girls") and season (e.g. "2025/26", "Fall 2025") from any column or header.
5. For parent info: look for columns like "Parent Name", "Guardian", "Parent Email", "Contact Email". Parent info may be on the same row as the player or the row below.

Normalize positions to: GK, CB, LB, RB, CM, DM, AM, LM, RM, LW, RW, ST. Use closest match or null.
Normalize coach roles to: "Head Coach", "Assistant Coach", or "Manager".
Flag rows as uncertain if: team is ambiguous, name is missing, or role is unclear.

Return ONLY valid JSON — no explanation, no markdown:
{
  "teams": [
    {
      "name": "U12 Boys A",
      "age_group": "U12",
      "season": "2025/26",
      "coaches": [
        { "full_name": "James Walsh", "email": "james@example.com", "role": "Head Coach", "uncertain": false, "uncertainty_reason": null }
      ],
      "players": [
        { "full_name": "Tom Smith", "jersey_number": 7, "position": "CM", "parent_name": "Sarah Smith", "parent_email": "sarah@example.com", "uncertain": false, "uncertainty_reason": null }
      ]
    }
  ],
  "uncertain_rows": [{ "raw": "original row text", "issue": "reason" }],
  "warnings": ["any general parsing notes"]
}

Rules:
- Every person belongs to exactly one team.
- email/parent fields: null if not present. Never invent emails.
- jersey_number: integer or null.
- uncertain: true if name missing, team ambiguous, or role unclear.
- Skip blank rows and column headers.
- If the file is a single team with no team column, use a generic name like "Team 1".${existingTeams.length > 0 ? `
- These teams already exist — if rows belong to one of them rather than a new team, add a warning: ${existingTeams.join(', ')}` : ''}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let file_base64: string, file_type: string, existing_teams: string[] = [];
  try {
    ({ file_base64, file_type, existing_teams = [] } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!file_base64 || !file_type) {
    return new Response(JSON.stringify({ error: 'file_base64 and file_type required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const isPdf = file_type === 'application/pdf' || file_type.includes('pdf');
  const isExcel = file_type.includes('spreadsheetml') || file_type.includes('ms-excel');

  // Build the Claude message depending on file type
  let messageContent: unknown[];

  if (isPdf) {
    // Claude natively reads PDFs as documents
    messageContent = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: file_base64 },
      },
      { type: 'text', text: INSTRUCTIONS(existing_teams) },
    ];
  } else if (isExcel) {
    // Convert Excel to CSV text using SheetJS
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
    messageContent = [{ type: 'text', text: `${INSTRUCTIONS(existing_teams)}\n\nSpreadsheet content:\n${csvText}` }];
  } else {
    // CSV / plain text
    const raw = atob(file_base64);
    messageContent = [{ type: 'text', text: `${INSTRUCTIONS(existing_teams)}\n\nSpreadsheet content:\n${raw}` }];
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
      max_tokens: 8192,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { teams: [], uncertain_rows: [], warnings: ['Could not parse AI response'] };
    } catch {
      parsed = { teams: [], uncertain_rows: [], warnings: ['Could not parse AI response'] };
    }
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
