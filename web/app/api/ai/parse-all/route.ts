import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import { requireRole } from '@/lib/apiAuth';

// Matches the maxDuration for this route in vercel.json — was mismatched at
// 120 here, which could silently cap the function short of what's configured.
export const maxDuration = 300;

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

// ─── Excel (.xlsx/.xls) → CSV text ─────────────────────────────────────────────

const EXCEL_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
function isExcelFile(f: FileInput): boolean {
  return !!(f.mimeType && EXCEL_MIMES.includes(f.mimeType)) || /\.xlsx?$/i.test(f.name ?? '');
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function excelCellToString(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v && v.result != null) return excelCellToString(v.result as ExcelJS.CellValue); // formula
    if ('text' in v && typeof v.text === 'string') return v.text; // hyperlink
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
  }
  return String(v);
}

async function excelToCSV(base64: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's nested dependencies (fast-csv) ship their own older @types/node,
  // which TS auto-includes as an extra typeRoot and merges against our
  // top-level one — the two ambient `Buffer` declarations conflict at the
  // type level even though they're the same value at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(base64, 'base64') as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return '';
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[]; // index 0 is unused by exceljs
    const cells = values.slice(1).map(v => csvCell(excelCellToString(v)));
    lines.push(cells.join(','));
  });
  return lines.join('\n');
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
  teams:   { name: string; alt_names: string[]; age_group: string; gender: string; confidence: string }[];
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

// Some schedule exports split an address across separate Street/City/State/
// Zip columns instead of one combined field — join whatever's present into
// one geocodable string.
function combineAddress(street: string, city: string, state: string, zip: string): string {
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}

function emptyResult(): ParsedResult {
  return { teams: [], players: [], events: [], coaches: [] };
}

function extractFromCSV(text: string): ParsedResult | null {
  const rows = parseCSV(text);
  if (rows.length < 2) return null;

  // Skip comment rows (start with #) to find header
  const headerIdx = rows.findIndex(r => r.length > 2 && !r[0].startsWith('#') && /[a-zA-Z]/.test(r[0]));
  if (headerIdx < 0) return null;
  const headers = rows[headerIdx];
  const data = rows.slice(headerIdx + 1).filter(r => !r[0].startsWith('#') && r.some(f => f));

  const result = emptyResult();
  const teamSet = new Map<string, { age_group: string; gender: string }>();

  // Detect format by columns present. "Type" is checked by VALUE, not just
  // presence — some real-world exports (e.g. a league's own schedule) have
  // a "type" column that's always blank, which isn't Format 1 at all; a
  // bare presence check would silently claim the file and drop everything.
  const TYPE_VALUES = ['player', 'coach', 'game', 'training', 'other'];
  const iTypeCheck = colIdx(headers, 'Type');
  const hasType = iTypeCheck >= 0 && data.some(r => TYPE_VALUES.includes((r[iTypeCheck] ?? '').trim().toLowerCase()));
  const hasRole     = colIdx(headers, 'Role', 'Role / Position') >= 0;
  const hasHomeTeam = colIdx(headers, 'Home Team', 'HomeTeam') >= 0;
  const hasDate     = colIdx(headers, 'Date', 'Event Date', 'Game Date') >= 0;
  // Format 3 needs a column that says which side is *our* team — a bare
  // Home Team/Visitor Team schedule (e.g. a league's own export) doesn't
  // tell us that, and guessing would silently mislabel every game as
  // "away" with no team assigned. Route those to Claude instead, which can
  // reason about it (e.g. matching a club name prefix across both sides).
  const hasTeamCol = colIdx(headers, 'Team', 'Team Name') >= 0;

  // Tracks whether a branch below actually processed this file — if none
  // did (unrecognised header layout), we must return null so the caller
  // falls back to Claude instead of silently treating it as "parsed, zero
  // results."
  let handled = false;

  // ── Format 1: "Type" column (test-full-club.csv style) ──────────────────
  if (hasType) {
    handled = true;
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
    const iLoc      = colIdx(headers, 'Location', 'Field Name', 'Venue', 'Field');
    const iAddr       = colIdx(headers, 'Address', 'Street Address', 'Venue Address', 'Full Address');
    const iCity       = colIdx(headers, 'City', 'Town');
    const iState      = colIdx(headers, 'State', 'Province');
    const iZip        = colIdx(headers, 'Zip', 'Zip Code', 'Postal Code');
    const iDuration   = colIdx(headers, 'Duration', 'Duration (min)', 'Duration Minutes');
    const iArrival    = colIdx(headers, 'Arrival Buffer', 'Arrive Early', 'Arrive', 'Minutes Early', 'Pre-Game Arrival');
    // If there's only one "field"-ish column, iLoc already claimed it above
    // as the venue name — don't also echo it into field_notes.
    const iFieldRaw   = colIdx(headers, 'Field', 'Field Details', 'Pitch', 'Field Number', 'Sub Field', 'Field / Pitch', 'Facility Code');
    const iField      = iFieldRaw === iLoc ? -1 : iFieldRaw;
    const iSurface    = colIdx(headers, 'Surface', 'Field Type', 'Turf / Grass', 'Turf Type');
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
        const city      = iCity       >= 0 ? (row[iCity]       ?? '').trim() : '';
        const state     = iState      >= 0 ? (row[iState]      ?? '').trim() : '';
        const zip       = iZip        >= 0 ? (row[iZip]        ?? '').trim() : '';
        const notes     = iNotes      >= 0 ? (row[iNotes]      ?? '').trim() : '';
        const coachNotes= iCoachNotes >= 0 ? (row[iCoachNotes] ?? '').trim() : '';
        const homeAway  = type === 'game' ? (posVal === 'home' ? 'home' : posVal === 'away' ? 'away' : '') : '';
        const uniform   = type === 'training' ? 'training' : (homeAway || '');
        const fieldType = /turf|artificial|synthetic|astroturf/.test(surface) ? 'turf'
          : /grass|natural|\bsod\b/.test(surface) ? 'grass' : '';
        const address   = combineAddress(rawAddr, city, state, zip) || (isGeocodableAddress(rawLoc) ? rawLoc : '');
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
    handled = true;
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
  else if (hasHomeTeam && hasDate && hasTeamCol) {
    handled = true;
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

  // No branch above actually processed this file (unrecognised header
  // layout, or a Home/Visitor schedule with no way to tell which side is
  // ours) — return null so the caller falls back to Claude instead of
  // treating this as "parsed, zero results."
  if (!handled) return null;

  // Build teams from collected team names
  for (const [name, meta] of teamSet) {
    result.teams.push({ name, alt_names: [], age_group: meta.age_group, gender: meta.gender, confidence: 'high' });
  }

  return result;
}

// ─── Claude fallback for PDFs / images / unrecognised formats ────────────────

const CLAUDE_SYSTEM = `You are analysing soccer club documents to extract structured data.
Return ONLY valid minified JSON with exactly these 4 keys, no markdown, no explanation:
{"teams":[{"name":"","alt_names":[],"age_group":"","gender":"","confidence":"high"}],
 "players":[{"full_name":"","jersey_number":"","position":"","parent_email":"","team_name":"","confidence":"high"}],
 "events":[{"title":"","type":"game","home_away":"","event_date":"YYYY-MM-DD","event_time":"HH:MM","location":"","address":"","uniform":"","duration_minutes":"","arrival_buffer_minutes":"","field_notes":"","field_type":"","notes":"","coach_notes":"","team_name":"","confidence":"high"}],
 "coaches":[{"full_name":"","email":"","team_name":"","confidence":"high"}]}
Rules:
- Some documents give a team TWO names — e.g. a roster mapping table with a
  "League Schedule Name" or "Division" column (the name a league's game
  schedule uses, often like "ClubName-Division-CoachSurname") alongside a
  "Team Name" column (the friendly name the club wants to use). When you see
  this pattern, extract ONE team per row: name = the friendly/display name
  (e.g. "Team Name" column), alt_names = [the league/schedule name]. Never
  create two separate teams for the same row.
- alt_names: other names this exact team is known by elsewhere in the
  document set (e.g. the league's schedule-matching name) — empty array if
  the team only has one name. Do not put age group or division codes here
  unless they function as the team's alternate name.
- team_name (on players/events/coaches): use whatever name that specific
  document calls the team by — it doesn't need to match a team's primary
  "name" exactly, matching against alt_names happens downstream.
- A game schedule lists two sides (e.g. "Home Team" and "Visitor Team"
  columns) — only ONE of them is the club whose data is being imported; the
  other is an opponent from a different club entirely. Figure out which
  side is ours (it's the name that recurs constantly across the schedule,
  often sharing one club-name prefix like "Maroons-", while the other side
  is a different name on every row) and set the event's team_name to OUR
  side only. Do NOT add an entry to the "teams" array for an opponent —
  only include teams that are genuinely part of the club being imported
  (established by a roster, coach list, or team-mapping document, or by
  being the recurring side of every schedule row). A schedule alone is
  never sufficient grounds to add a new team to the "teams" array.
- event_date: YYYY-MM-DD format
- event_time: HH:MM 24h format
- type: "game", "training", or "other"
- home_away: "home" if the team plays at their own field, "away" if travelling to opponent's field, empty string for training/other
- title: for games use "vs X" (home) or "@ X" (away) matching home_away; for training use "Team Training" or session description
- location: the venue/field's human-readable NAME (e.g. "Stevens Field - SS 1"), not an internal facility code — strip any "Away @ ", "Home @ ", or "@ " prefix (e.g. "Away @ Tri-County SC Field" → "Tri-County SC Field")
- address: a single geocodable street address, ASSEMBLED even if the
  document splits it across multiple columns (e.g. separate Street
  Address / City / State / Zip columns, or Address / Town) — join them
  into one string like "627 E Ridgewood Ave, Ridgewood, NJ 07450". Every
  document is different: look across all columns on the row for anything
  that looks like address components and combine what you find. Empty
  string only if no real street-level address exists anywhere on the row
  — a bare facility code or field nickname is not an address.
- uniform: "home" or "away" for games, "training" for training sessions, empty string for other
- duration_minutes: numeric string if duration mentioned (e.g. "90"), empty string if not stated
- arrival_buffer_minutes: numeric string of minutes early players should arrive (e.g. "30" if document says "arrive 30 min early"), empty string if not stated
- field_notes: an internal facility/field CODE if the document has one
  separate from the readable venue name (e.g. "MAR-Stevens SS1" alongside
  "Stevens Field - SS 1"), or specific sub-field details (e.g. "Field 1,
  Pitch B"). Empty string if the document only gives one name for the venue.
- field_type: "turf" or "grass" from any surface/turf-type column — treat
  "Artificial", "Synthetic", "AstroTurf", "Turf" as "turf" and "Natural",
  "Sod", "Grass" as "grass". Empty string if surface isn't stated.
- notes: any team-facing notes or instructions visible to all (e.g. "Bring extra water", "Wear training kit"), empty string if none
- coach_notes: any coach-only or internal notes (e.g. "Focus on set pieces", "Call-up players available"), empty string if none
- confidence: "high"=clearly stated, "medium"=inferred, "low"=uncertain`;

function normalizeTeams(teams: unknown): ParsedResult['teams'] {
  if (!Array.isArray(teams)) return [];
  return teams.map((t: Record<string, unknown>) => ({
    name: typeof t.name === 'string' ? t.name : '',
    alt_names: Array.isArray(t.alt_names) ? t.alt_names.filter((n): n is string => typeof n === 'string') : [],
    age_group: typeof t.age_group === 'string' ? t.age_group : '',
    gender: typeof t.gender === 'string' ? t.gender : '',
    confidence: typeof t.confidence === 'string' ? t.confidence : 'high',
  }));
}

// Walks a `"key": [ {...}, {...}, ... ]` array by hand, parsing one
// balanced object at a time. Used when the response got cut off mid-array
// (e.g. a large schedule hitting max_tokens) — a regex expecting the array
// to actually close with `]` finds nothing at all in that case, losing
// every record instead of just the ones after the cutoff.
function extractArrayObjects(raw: string, key: string): unknown[] {
  const marker = raw.indexOf(`"${key}"`);
  if (marker < 0) return [];
  const bracketStart = raw.indexOf('[', marker);
  if (bracketStart < 0) return [];

  const out: unknown[] = [];
  let i = bracketStart + 1;
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i])) i++;
    if (i >= raw.length || raw[i] === ']') break;
    if (raw[i] !== '{') break;

    let depth = 0, j = i, inStr = false, esc = false;
    for (; j < raw.length; j++) {
      const ch = raw[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    if (depth !== 0) break; // truncated mid-object — stop, keep what we found so far

    try { out.push(JSON.parse(raw.slice(i, j))); } catch { /* skip malformed object */ }
    i = j;
  }
  return out;
}

function parseClaudeJSON(raw: string): ParsedResult {
  try {
    const p = JSON.parse(raw);
    return { teams: normalizeTeams(p.teams), players: p.players ?? [], events: p.events ?? [], coaches: p.coaches ?? [] };
  } catch {
    // Truncated or otherwise malformed JSON — salvage whatever complete
    // records we can rather than losing the whole file's extraction.
    const result = emptyResult();
    for (const key of ['teams', 'players', 'events', 'coaches'] as const) {
      (result[key] as unknown[]) = extractArrayObjects(raw, key);
    }
    result.teams = normalizeTeams(result.teams);
    return result;
  }
}

// Each file gets its own call with its own dedicated max_tokens budget —
// a shared budget across a whole batch (the old behaviour) meant a single
// large roster PDF could starve every other file's extraction of tokens.
async function askClaudeForFile(file: FileInput): Promise<ParsedResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [{ type: 'text', text: `--- ${file.name} ---` }];
  if (file.text) {
    content.push({ type: 'text', text: file.text });
  } else if (file.base64 && file.mimeType) {
    if (isImageMime(file.mimeType)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: file.mimeType, data: file.base64 } });
    } else if (file.mimeType === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' as const, data: file.base64 } });
    } else {
      // No native Claude document type for this MIME — nothing to send.
      return emptyResult();
    }
  } else {
    return emptyResult();
  }
  content.push({ type: 'text', text: 'Extract all teams, players, events, and coaches.' });

  // Streaming avoids the SDK's non-streaming HTTP timeout, required once
  // max_tokens goes past ~16K. Set high (Sonnet 4.6's actual ceiling) since
  // a full-season schedule can run 400+ games — a truncated response loses
  // every event after the cutoff, and this only caps length, not cost.
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 128000,
    system: CLAUDE_SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const msg = await stream.finalMessage();
  const raw = (msg.content[0] as Anthropic.TextBlock).text ?? '';
  return parseClaudeJSON(raw);
}

// A single big text file (e.g. a full-season schedule export, hundreds of
// rows) generates a proportionally long response — one 319-row schedule
// took ~290s in testing, dangerously close to this route's 300s ceiling.
// Splitting it into row-count chunks and running them in parallel bounds
// wall-clock time by the slowest CHUNK instead of the whole file, and that
// bound doesn't grow as a season gets bigger — more chunks in parallel,
// not one ever-longer serial call.
const MAX_ROWS_PER_TEXT_CHUNK = 75;

function chunkTextFile(file: FileInput): FileInput[] {
  if (!file.text) return [file];
  const lines = file.text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= MAX_ROWS_PER_TEXT_CHUNK + 1) return [file]; // +1 for header
  const header = lines[0];
  const dataLines = lines.slice(1);
  const chunks: FileInput[] = [];
  for (let i = 0; i < dataLines.length; i += MAX_ROWS_PER_TEXT_CHUNK) {
    const part = dataLines.slice(i, i + MAX_ROWS_PER_TEXT_CHUNK);
    chunks.push({ name: `${file.name} (rows ${i + 1}-${i + part.length})`, text: [header, ...part].join('\n') });
  }
  return chunks;
}

async function askClaude(files: FileInput[]): Promise<ParsedResult> {
  const expanded = files.flatMap(chunkTextFile);
  const results = await Promise.all(expanded.map(file =>
    askClaudeForFile(file).catch(err => {
      console.error(`[parse-all] Claude extraction failed for "${file.name}":`, err);
      return emptyResult();
    })
  ));
  return results.reduce((acc, r) => merge(acc, r), emptyResult());
}

// ─── Merge two ParsedResults ──────────────────────────────────────────────────
// Teams can be named differently across documents (e.g. a league's schedule
// export vs. a roster mapping table) — match on name OR any alt_name rather
// than exact name equality, so the same team from two files consolidates
// into one entry instead of two.

type Team = ParsedResult['teams'][number];

function normName(s: string): string { return s.toLowerCase().trim(); }
function teamAllNames(t: Team): string[] { return [t.name, ...(t.alt_names ?? [])].filter(Boolean); }

function addAltName(t: Team, candidate: string) {
  const cand = candidate.trim();
  if (!cand) return;
  if (teamAllNames(t).some(n => normName(n) === normName(cand))) return;
  t.alt_names.push(cand);
}

// A document that supplied alt_names had an explicit opinion about which
// name is the "real" one (e.g. Teams.pdf mapping league name → team name).
// A bare single-name reference from another file (roster row, schedule row)
// has no such opinion, so when the two disagree, trust the one with alias
// info rather than whichever happened to be seen first.
function mergeOneTeam(existing: Team, incoming: Team) {
  const incomingHasOpinion = (incoming.alt_names ?? []).length > 0;
  const existingHasOpinion = (existing.alt_names ?? []).length > 0;
  if (incomingHasOpinion && !existingHasOpinion) {
    const oldName = existing.name;
    existing.name = incoming.name;
    addAltName(existing, oldName);
    for (const alt of incoming.alt_names) addAltName(existing, alt);
  } else {
    addAltName(existing, incoming.name);
    for (const alt of (incoming.alt_names ?? [])) addAltName(existing, alt);
  }
  existing.age_group = existing.age_group || incoming.age_group;
  existing.gender     = existing.gender     || incoming.gender;
}

function mergeTeamsList(a: Team[], b: Team[]): Team[] {
  const teams = a.map(t => ({ ...t, alt_names: [...(t.alt_names ?? [])] }));
  for (const bt of b) {
    const bNames = teamAllNames(bt).map(normName);
    const existing = teams.find(at => teamAllNames(at).map(normName).some(n => bNames.includes(n)));
    if (existing) mergeOneTeam(existing, bt);
    else teams.push({ ...bt, alt_names: [...(bt.alt_names ?? [])] });
  }
  return teams;
}

function merge(a: ParsedResult, b: ParsedResult): ParsedResult {
  return {
    teams:   mergeTeamsList(a.teams, b.teams),
    players: [...a.players, ...b.players],
    events:  [...a.events,  ...b.events],
    coaches: [...a.coaches, ...b.coaches],
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  try {
    const { files } = await req.json() as { files: FileInput[] };
    if (!files?.length) return NextResponse.json({ error: 'No files provided.' }, { status: 400 });

    let result = emptyResult();
    const forClaude: FileInput[] = [];

    for (const file of files) {
      // Excel workbooks aren't a Claude-native document type (only PDF/images
      // are) — convert to CSV text first so they go through the same path
      // as an uploaded .csv instead of being silently dropped.
      let normalized = file;
      if (!file.text && file.base64 && isExcelFile(file)) {
        try {
          normalized = { text: await excelToCSV(file.base64), name: file.name };
        } catch (err) {
          console.error(`[parse-all] failed to read Excel file "${file.name}":`, err);
        }
      }

      if (normalized.text) {
        // Try JS CSV parser first
        const parsed = extractFromCSV(normalized.text);
        if (parsed) {
          result = merge(result, parsed);
        } else {
          forClaude.push(normalized); // unrecognised text format → Claude
        }
      } else {
        forClaude.push(normalized); // PDF / image → Claude
      }
    }

    // Use Claude only for files that need it
    if (forClaude.length > 0) {
      const claudeResult = await askClaude(forClaude);
      result = merge(result, claudeResult);
    }

    // Deterministic CSV parsing has no idea about alt_names (a schedule file
    // parsed before an alias-aware file like a league/team-name mapping is
    // merged in has already created its own bare team entry), so folding
    // each file's teams in as it's processed isn't enough — do one final
    // self-consolidation pass over the whole team list now that every
    // alias is known.
    result.teams = mergeTeamsList([], result.teams);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[parse-all] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
