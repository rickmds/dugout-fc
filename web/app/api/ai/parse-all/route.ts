import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_MIMES: ImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function isImageMime(m: string): m is ImageMime { return IMAGE_MIMES.includes(m as ImageMime); }

type FileInput = { base64?: string; mimeType?: string; text?: string; name: string };

// ─── JS CSV parser (handles structured files instantly, no token limits) ──────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let field = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQ) { inQ = true; }
      else if (ch === '"' && inQ && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"' && inQ) { inQ = false; }
      else if (ch === ',' && !inQ) { fields.push(field.trim()); field = ''; }
      else { field += ch; }
    }
    fields.push(field.trim());
    rows.push(fields);
  }
  return rows;
}

function colIdx(headers: string[], ...names: string[]): number {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const n of names) {
    const idx = lower.indexOf(n.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (idx >= 0) return idx;
  }
  return -1;
}

function toIsoDate(raw: string): string {
  if (!raw) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY or M/D/YYYY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return raw;
}

function to24h(raw: string): string {
  if (!raw) return '';
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = m[2];
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${min}`;
  }
  return raw;
}

const COACH_ROLES = ['coach', 'headcoach', 'head coach', 'manager', 'director', 'trainer', 'staff', 'assistant', 'assistantcoach'];
function isCoachRole(role: string) { return COACH_ROLES.some(r => role.toLowerCase().replace(/\s+/g, '').includes(r.replace(/\s+/g, ''))); }

type ParsedResult = {
  teams:   { name: string; age_group: string; gender: string; confidence: string }[];
  players: { full_name: string; jersey_number: string; position: string; parent_email: string; team_name: string; confidence: string }[];
  events:  { title: string; type: string; home_away: string; event_date: string; event_time: string; location: string; address: string; uniform: string; duration_minutes: string; arrival_buffer_minutes: string; field_notes: string; field_type: string; notes: string; coach_notes: string; team_name: string; confidence: string }[];
  coaches: { full_name: string; email: string; team_name: string; confidence: string }[];
};

function cleanLocation(loc: string): string {
  // Strip "Away @ " / "Home @ " / "@ " prefixes — uniform field already captures home/away
  return loc.replace(/^(away|home)\s*@\s*/i, '').replace(/^@\s*/i, '').trim();
}

function isGeocodableAddress(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (/^(Away|Home)\b/i.test(t)) return false;
  if (/^[@]/.test(t)) return false;
  if (/^vs\s/i.test(t)) return false;
  if (!/\d/.test(t)) return false;
  return true;
}

function emptyResult(): ParsedResult {
  return { teams: [], players: [], events: [], coaches: [] };
}

function extractFromCSV(text: string): ParsedResult | null {
  const rows = parseCSV(text);
  if (rows.length < 2) return null;

  // Skip comment rows (start with #) to find header
  let headerIdx = rows.findIndex(r => r.length > 2 && !r[0].startsWith('#') && /[a-zA-Z]/.test(r[0]));
  if (headerIdx < 0) return null;
  const headers = rows[headerIdx];
  const data = rows.slice(headerIdx + 1).filter(r => !r[0].startsWith('#') && r.some(f => f));

  const result = emptyResult();
  const teamSet = new Map<string, { age_group: string; gender: string }>();

  // Detect format by columns present
  const hasType     = colIdx(headers, 'Type') >= 0;
  const hasRole     = colIdx(headers, 'Role', 'Role / Position') >= 0;
  const hasHomeTeam = colIdx(headers, 'Home Team', 'HomeTeam') >= 0;
  const hasDate     = colIdx(headers, 'Date', 'Event Date', 'Game Date') >= 0;

  // ── Format 1: "Type" column (test-full-club.csv style) ──────────────────
  if (hasType) {
    const iType   = colIdx(headers, 'Type');
    const iTeam   = colIdx(headers, 'Team', 'Team Name');
    const iAG     = colIdx(headers, 'Age Group', 'Age');
    const iGender = colIdx(headers, 'Gender');
    const iFirst  = colIdx(headers, 'First Name', 'FirstName');
    const iLast   = colIdx(headers, 'Last Name', 'LastName');
    const iJersey = colIdx(headers, 'Jersey #', 'Jersey Number', 'Jersey', '#');
    const iPos    = colIdx(headers, 'Role / Position', 'Position', 'Pos');
    const iEmail  = colIdx(headers, 'Email', 'Parent Email');
    const iDate     = colIdx(headers, 'Event Date', 'Game Date', 'Date');
    const iTime     = colIdx(headers, 'Event Time', 'Game Time', 'Time');
    const iOpp      = colIdx(headers, 'Opponent / Note', 'Opponent', 'Title');
    const iLoc      = colIdx(headers, 'Location', 'Field', 'Venue');
    const iAddr       = colIdx(headers, 'Address', 'Street Address', 'Venue Address', 'Full Address');
    const iDuration   = colIdx(headers, 'Duration', 'Duration (min)', 'Duration Minutes');
    const iArrival    = colIdx(headers, 'Arrival Buffer', 'Arrive Early', 'Arrive', 'Minutes Early', 'Pre-Game Arrival');
    const iField      = colIdx(headers, 'Field Details', 'Pitch', 'Field Number', 'Sub Field', 'Field / Pitch');
    const iSurface    = colIdx(headers, 'Surface', 'Field Type', 'Turf / Grass');
    const iNotes      = colIdx(headers, 'Notes', 'Note', 'Event Notes', 'Comments', 'Team Message');
    const iCoachNotes = colIdx(headers, 'Coach Notes', 'Staff Notes', 'Internal Notes', 'Coach Only');

    for (const row of data) {
      const type   = (row[iType]   ?? '').trim().toLowerCase();
      const team   = (row[iTeam]   ?? '').trim();
      const ag     = iAG     >= 0 ? (row[iAG]     ?? '').trim() : '';
      const gender = iGender >= 0 ? (row[iGender] ?? '').trim() : '';
      if (team && !teamSet.has(team)) teamSet.set(team, { age_group: ag, gender });

      if (type === 'player') {
        const first = iFirst >= 0 ? (row[iFirst] ?? '').trim() : '';
        const last  = iLast  >= 0 ? (row[iLast]  ?? '').trim() : '';
        const name  = first && last ? `${first} ${last}` : first || last;
        if (!name) continue;
        result.players.push({
          full_name:     name,
          jersey_number: iJersey >= 0 ? (row[iJersey] ?? '').trim() : '',
          position:      iPos    >= 0 ? (row[iPos]    ?? '').trim() : '',
          parent_email:  iEmail  >= 0 ? (row[iEmail]  ?? '').trim() : '',
          team_name:     team,
          confidence:    'high',
        });
      } else if (type === 'coach') {
        const first = iFirst >= 0 ? (row[iFirst] ?? '').trim() : '';
        const last  = iLast  >= 0 ? (row[iLast]  ?? '').trim() : '';
        const name  = first && last ? `${first} ${last}` : first || last;
        if (!name) continue;
        result.coaches.push({
          full_name:  name,
          email:      iEmail >= 0 ? (row[iEmail] ?? '').trim() : '',
          team_name:  team,
          confidence: 'high',
        });
      } else if (type === 'game' || type === 'training' || type === 'other') {
        const opp      = iOpp      >= 0 ? (row[iOpp]      ?? '').trim() : '';
        const date     = iDate     >= 0 ? toIsoDate((row[iDate] ?? '').trim()) : '';
        const time     = iTime     >= 0 ? to24h((row[iTime] ?? '').trim()) : '';
        const rawLoc    = iLoc        >= 0 ? (row[iLoc]        ?? '').trim() : '';
        const rawAddr   = iAddr       >= 0 ? (row[iAddr]       ?? '').trim() : '';
        const posVal    = iPos        >= 0 ? (row[iPos]        ?? '').trim().toLowerCase() : '';
        const duration  = iDuration   >= 0 ? (row[iDuration]   ?? '').trim() : '';
        const arrival   = iArrival    >= 0 ? (row[iArrival]    ?? '').trim() : '';
        const field     = iField      >= 0 ? (row[iField]      ?? '').trim() : '';
        const surface   = iSurface    >= 0 ? (row[iSurface]    ?? '').trim().toLowerCase() : '';
        const notes     = iNotes      >= 0 ? (row[iNotes]      ?? '').trim() : '';
        const coachNotes= iCoachNotes >= 0 ? (row[iCoachNotes] ?? '').trim() : '';
        const homeAway  = type === 'game' ? (posVal === 'home' ? 'home' : posVal === 'away' ? 'away' : '') : '';
        const uniform   = type === 'training' ? 'training' : (homeAway || '');
        const fieldType = surface.includes('turf') ? 'turf' : surface.includes('grass') ? 'grass' : '';
        const address   = rawAddr || (isGeocodableAddress(rawLoc) ? rawLoc : '');
        // Build title: for games prefix with vs/@ based on venue
        const oppName   = opp.replace(/^(vs\s+|@\s+)/i, '').trim();
        const gameTitle = type === 'game' && oppName
          ? `${homeAway === 'away' ? '@' : 'vs'} ${oppName}`
          : opp || (type === 'training' ? 'Training' : 'Event');
        if (!date) continue;
        result.events.push({
          title:                   gameTitle,
          type,
          home_away:               homeAway,
          event_date:              date,
          event_time:              time,
          location:                cleanLocation(rawLoc),
          address,
          uniform,
          duration_minutes:        duration ? duration.replace(/[^0-9]/g, '') : '',
          arrival_buffer_minutes:  arrival  ? arrival.replace(/[^0-9]/g, '')  : '',
          field_notes:             field,
          field_type:              fieldType,
          notes,
          coach_notes:             coachNotes,
          team_name:               team,
          confidence:              'high',
        });
      }
    }
  }

  // ── Format 2: "Role" column (test-import.csv style) ─────────────────────
  else if (hasRole) {
    const iRole   = colIdx(headers, 'Role');
    const iTeam   = colIdx(headers, 'Team', 'Team Name');
    const iFirst  = colIdx(headers, 'First Name', 'FirstName');
    const iLast   = colIdx(headers, 'Last Name', 'LastName');
    const iJersey = colIdx(headers, 'Jersey Number', 'Jersey #', 'Jersey', '#');
    const iPos    = colIdx(headers, 'Position', 'Pos');
    const iEmail  = colIdx(headers, 'Parent Email', 'Email');
    const iAG     = colIdx(headers, 'Age Group', 'Age');

    for (const row of data) {
      const role  = (row[iRole]  ?? '').trim();
      const team  = iTeam >= 0 ? (row[iTeam] ?? '').trim() : '';
      const ag    = iAG   >= 0 ? (row[iAG]   ?? '').trim() : '';
      if (team && !teamSet.has(team)) teamSet.set(team, { age_group: ag, gender: '' });
      const first = iFirst >= 0 ? (row[iFirst] ?? '').trim() : '';
      const last  = iLast  >= 0 ? (row[iLast]  ?? '').trim() : '';
      const name  = first && last ? `${first} ${last}` : first || last;
      if (!name) continue;
      if (isCoachRole(role)) {
        result.coaches.push({ full_name: name, email: iEmail >= 0 ? (row[iEmail] ?? '').trim() : '', team_name: team, confidence: 'high' });
      } else {
        result.players.push({
          full_name:     name,
          jersey_number: iJersey >= 0 ? (row[iJersey] ?? '').trim() : '',
          position:      iPos    >= 0 ? (row[iPos]    ?? '').trim() : '',
          parent_email:  iEmail  >= 0 ? (row[iEmail]  ?? '').trim() : '',
          team_name:     team,
          confidence:    'high',
        });
      }
    }
  }

  // ── Format 3: Schedule CSV (Home Team / Visitor Team columns) ────────────
  else if (hasHomeTeam && hasDate) {
    const iTeam    = colIdx(headers, 'Team', 'Team Name');
    const iDate    = colIdx(headers, 'Date', 'Game Date');
    const iTime    = colIdx(headers, 'Time', 'Game Time');
    const iHome    = colIdx(headers, 'Home Team', 'HomeTeam');
    const iVisitor = colIdx(headers, 'Visitor Team', 'VisitorTeam', 'Away Team');
    const iLoc     = colIdx(headers, 'Location', 'Field', 'Venue');

    for (const row of data) {
      const team    = iTeam    >= 0 ? (row[iTeam]    ?? '').trim() : '';
      const date    = iDate    >= 0 ? toIsoDate((row[iDate] ?? '').trim()) : '';
      const time    = iTime    >= 0 ? to24h((row[iTime] ?? '').trim()) : '';
      const home    = iHome    >= 0 ? (row[iHome]    ?? '').trim() : '';
      const visitor = iVisitor >= 0 ? (row[iVisitor] ?? '').trim() : '';
      const loc     = iLoc     >= 0 ? (row[iLoc]     ?? '').trim() : '';
      if (!date) continue;
      const isHome  = home === team;
      const opp     = isHome ? visitor : home;
      const title   = isHome ? `vs ${opp}` : `@ ${opp}`;
      if (team && !teamSet.has(team)) teamSet.set(team, { age_group: '', gender: '' });
      result.events.push({ title, type: 'game', home_away: isHome ? 'home' : 'away', event_date: date, event_time: time, location: cleanLocation(loc), address: isGeocodableAddress(loc) ? loc : '', uniform: isHome ? 'home' : 'away', duration_minutes: '', arrival_buffer_minutes: '', field_notes: '', field_type: '', notes: '', coach_notes: '', team_name: team, confidence: 'high' });
    }
  }

  // Format not recognised — return null so we fall back to Claude
  else if (!hasType && !hasRole && !hasHomeTeam) {
    return null;
  }

  // Build teams from collected team names
  for (const [name, meta] of teamSet) {
    result.teams.push({ name, age_group: meta.age_group, gender: meta.gender, confidence: 'high' });
  }

  return result;
}

// ─── Claude fallback for PDFs / images / unrecognised formats ────────────────

const CLAUDE_SYSTEM = `You are analysing soccer club documents to extract structured data.
Return ONLY valid minified JSON with exactly these 4 keys, no markdown, no explanation:
{"teams":[{"name":"","age_group":"","gender":"","confidence":"high"}],
 "players":[{"full_name":"","jersey_number":"","position":"","parent_email":"","team_name":"","confidence":"high"}],
 "events":[{"title":"","type":"game","home_away":"","event_date":"YYYY-MM-DD","event_time":"HH:MM","location":"","address":"","uniform":"","duration_minutes":"","arrival_buffer_minutes":"","field_notes":"","field_type":"","notes":"","coach_notes":"","team_name":"","confidence":"high"}],
 "coaches":[{"full_name":"","email":"","team_name":"","confidence":"high"}]}
Rules:
- event_date: YYYY-MM-DD format
- event_time: HH:MM 24h format
- type: "game", "training", or "other"
- home_away: "home" if the team plays at their own field, "away" if travelling to opponent's field, empty string for training/other
- title: for games use "vs X" (home) or "@ X" (away) matching home_away; for training use "Team Training" or session description
- location: venue name only — strip any "Away @ ", "Home @ ", or "@ " prefix (e.g. "Away @ Tri-County SC Field" → "Tri-County SC Field")
- address: geocodable street address ONLY (e.g. "7000 Soccer Park Dr, St. Louis, MO 63129") — empty string if no real street address found
- uniform: "home" or "away" for games, "training" for training sessions, empty string for other
- duration_minutes: numeric string if duration mentioned (e.g. "90"), empty string if not stated
- arrival_buffer_minutes: numeric string of minutes early players should arrive (e.g. "30" if document says "arrive 30 min early"), empty string if not stated
- field_notes: specific field/pitch details if mentioned (e.g. "Field 1, Pitch B" or "East Complex"), empty string if none
- field_type: "turf" or "grass" if surface mentioned, empty string if unknown
- notes: any team-facing notes or instructions visible to all (e.g. "Bring extra water", "Wear training kit"), empty string if none
- coach_notes: any coach-only or internal notes (e.g. "Focus on set pieces", "Call-up players available"), empty string if none
- confidence: "high"=clearly stated, "medium"=inferred, "low"=uncertain`;

async function askClaude(files: FileInput[]): Promise<ParsedResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  for (const file of files) {
    content.push({ type: 'text', text: `--- ${file.name} ---` });
    if (file.text) {
      content.push({ type: 'text', text: file.text });
    } else if (file.base64 && file.mimeType) {
      if (isImageMime(file.mimeType)) {
        content.push({ type: 'image', source: { type: 'base64', media_type: file.mimeType, data: file.base64 } });
      } else if (file.mimeType === 'application/pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' as const, data: file.base64 } });
      }
    }
  }
  content.push({ type: 'text', text: 'Extract all teams, players, events, and coaches.' });

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: CLAUDE_SYSTEM,
    messages: [{ role: 'user', content }],
  });

  const raw = (msg.content[0] as Anthropic.TextBlock).text ?? '';
  try {
    const p = JSON.parse(raw);
    return { teams: p.teams ?? [], players: p.players ?? [], events: p.events ?? [], coaches: p.coaches ?? [] };
  } catch {
    // Partial JSON — extract what we can
    const result = emptyResult();
    for (const key of ['teams', 'players', 'events', 'coaches'] as const) {
      const m = raw.match(new RegExp(`"${key}":\\s*(\\[.*?\\])`, 's'));
      if (m) { try { (result[key] as unknown[]) = JSON.parse(m[1]); } catch { /* skip */ } }
    }
    return result;
  }
}

// ─── Merge two ParsedResults ──────────────────────────────────────────────────

function merge(a: ParsedResult, b: ParsedResult): ParsedResult {
  const teamNames = new Set(a.teams.map(t => t.name.toLowerCase()));
  return {
    teams:   [...a.teams,   ...b.teams.filter(t => !teamNames.has(t.name.toLowerCase()))],
    players: [...a.players, ...b.players],
    events:  [...a.events,  ...b.events],
    coaches: [...a.coaches, ...b.coaches],
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { files } = await req.json() as { files: FileInput[] };
    if (!files?.length) return NextResponse.json({ error: 'No files provided.' }, { status: 400 });

    let result = emptyResult();
    const forClaude: FileInput[] = [];

    for (const file of files) {
      if (file.text) {
        // Try JS CSV parser first
        const parsed = extractFromCSV(file.text);
        if (parsed) {
          result = merge(result, parsed);
        } else {
          forClaude.push(file); // unrecognised text format → Claude
        }
      } else {
        forClaude.push(file); // PDF / image → Claude
      }
    }

    // Use Claude only for files that need it
    if (forClaude.length > 0) {
      const claudeResult = await askClaude(forClaude);
      result = merge(result, claudeResult);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[parse-all] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
