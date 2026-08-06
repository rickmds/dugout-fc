import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file     = formData.get('file')      as File | null;
    const clubName = formData.get('club_name') as string | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const text = await file.text();
    if (!text.trim()) return NextResponse.json({ error: 'File is empty' }, { status: 400 });

    const clubContext = clubName
      ? `The club uploading this schedule is "${clubName}". Their teams may appear as "${clubName}" or short versions of that name.`
      : 'The club uploading this schedule manages multiple youth soccer teams.';

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      messages: [{
        role: 'user',
        content: `${clubContext}

Parse this soccer schedule and extract HOME games only — games where one of OUR teams is listed as the Home team.

For each home game return a compact JSON object with these exact keys:
- game_date: YYYY-MM-DD (required)
- opponent: the visiting/away team name (required)
- age_group: e.g. "U10", "U12 Boys", "U14 Girls" — null if unclear
- gender: "Boys", "Girls", or null
- our_team: our team name exactly as it appears in the file — null if unclear
- league: competition name e.g. "EDP", "NCSA", "GotSport", "Friendlies" — null if unclear
- notes: any extra info (time window, division) — null if none

Rules:
- ONLY include games where OUR club's team is listed as HOME
- SKIP games where we are the Away/Visiting team
- If home/away is ambiguous, include it with notes: "unclear home/away"
- Parse dates regardless of format (MM/DD/YYYY, written out, etc.)
- Return ONLY a JSON array — no explanation, no markdown, no code fences

Schedule:
${text.slice(0, 150000)}`,
      }],
    });

    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let games: unknown[];
    try {
      games = JSON.parse(cleaned);
      if (!Array.isArray(games)) games = [];
    } catch {
      games = [];
    }

    return NextResponse.json({ games });
  } catch (e) {
    console.error('/api/games/import-pending error', e);
    return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });
  }
}
