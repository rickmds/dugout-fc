// Parsers for NCSA's club-admin-only reports (Administrative Area / Game
// Schedule Reports) — all regex-based against the raw HTML, matching this
// codebase's established convention (see sync-ncsa-schedule) rather than
// an AI call, since the markup is stable, stable-shaped, and small.
// Verified against real saved HTML for every report type before this file
// was written — see the session notes for the exact table structure each
// one relies on.

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  // Case-insensitive — real pages mix <TD> and <td> within the same row
  // (confirmed against every report: the fines table alone has both).
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml))) cells.push(stripTags(m[1]));
  return cells;
}

function allRows(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
}

// "10/04/2026 09:00 AM" (overlap/gap/missing-score) or
// "09/05/26 @ 12:00 AM" (TBS report, 2-digit year, "@" separator) — both
// confirmed against real report pages, handled by one pattern.
export function parseNcsaDateTime(raw: string): { date: string; time: string } | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:@)?\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const [, mm, dd, yyRaw, hh12, min, ampm] = m;
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  let hh = parseInt(hh12, 10);
  if (ampm.toUpperCase() === 'AM') hh = hh === 12 ? 0 : hh;
  else hh = hh === 12 ? 12 : hh + 12;
  return {
    date: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
    time: `${String(hh).padStart(2, '0')}:${min}:00`,
  };
}

export interface NcsaFine {
  fineId: string; gameId: string | null; club: string; teamRawName: string;
  reason: string; submittedBy: string; fineDate: string | null; amount: number | null; status: string;
}

// finesListAll.cfm — each real row is <tr ... onclick="SubmitForm(ID)">
// with 9 cells: Fine ID, Game, Club, Team Fined, Fine (reason), By,
// Dated, Amount, Status.
export function parseFinesReport(html: string): NcsaFine[] {
  const results: NcsaFine[] = [];
  for (const rowHtml of allRows(html)) {
    const idMatch = /onclick="SubmitForm\((\d+)\)"/.exec(rowHtml);
    if (!idMatch) continue;
    const cells = extractCells(rowHtml);
    if (cells.length < 9) continue;
    const [fineId, gameId, club, teamRawName, reason, submittedBy, dated, amountRaw, status] = cells;
    const dateMatch = dated.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    const fineDate = dateMatch
      ? `${dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`
      : null;
    const amount = amountRaw ? parseFloat(amountRaw.replace(/[^0-9.]/g, '')) : null;
    results.push({
      fineId: idMatch[1], gameId: gameId || null, club, teamRawName,
      reason, submittedBy, fineDate, amount: Number.isFinite(amount) ? amount : null, status,
    });
  }
  return results;
}

export interface NcsaConflictGame {
  gameId: string; date: string | null; time: string | null; field: string; division: string; home: string; visitor: string;
}
export interface NcsaConflict { a: NcsaConflictGame; b: NcsaConflictGame; minutes: number | null }

// rptGameOverlap.cfm / rptGameGapTime.cfm — a repeating pattern of two
// game rows (6 cells: Game, Date/Time, PlayField, Div, Home, Visitor)
// followed by one summary row ("Overlap by :" / "Gap by :" + duration).
// Walked as a small sliding buffer rather than fixed-index grouping so a
// stray header/blank row never throws the pairing off.
export function parseConflictReport(html: string): NcsaConflict[] {
  const results: NcsaConflict[] = [];
  const buffer: NcsaConflictGame[] = [];
  for (const rowHtml of allRows(html)) {
    const cells = extractCells(rowHtml);
    if (!cells.length) continue;
    const joined = cells.join(' ');
    if (/(overlap|gap)\s*by\s*:/i.test(joined)) {
      if (buffer.length === 2) {
        const mm = joined.match(/(\d+)\s*hours?\s*(\d+)\s*min/i);
        const minutes = mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : null;
        results.push({ a: buffer[0], b: buffer[1], minutes });
      }
      buffer.length = 0;
      continue;
    }
    if (/^\d+$/.test(cells[0]) && cells.length >= 5) {
      const dt = parseNcsaDateTime(cells[1] ?? '');
      buffer.push({
        gameId: cells[0], date: dt?.date ?? null, time: dt?.time ?? null,
        field: cells[2] ?? '', division: cells[3] ?? '', home: cells[4] ?? '', visitor: cells[5] ?? '',
      });
      if (buffer.length > 2) buffer.shift();
    }
  }
  return results;
}

export interface NcsaGameRow {
  gameId: string; date: string | null; time: string | null; fieldOrType: string; division: string; home: string; visitor: string;
}

// rptGameMissingScore.cfm and rptPendingTBSgames.cfm share the exact same
// shape: one row per game, 6 cells (Game, Date/Time, Field-or-TBS-type,
// Division, Home, Visitor) — the TBS report just repurposes the "field"
// column to hold the TBS placeholder type text instead of a real venue.
export function parseGameListReport(html: string): NcsaGameRow[] {
  const results: NcsaGameRow[] = [];
  for (const rowHtml of allRows(html)) {
    const cells = extractCells(rowHtml);
    if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    const dt = parseNcsaDateTime(cells[1]);
    results.push({
      gameId: cells[0], date: dt?.date ?? null, time: dt?.time ?? null,
      fieldOrType: cells[2] ?? '', division: cells[3] ?? '', home: cells[4] ?? '', visitor: cells[5] ?? '',
    });
  }
  return results;
}

export interface NcsaDisciplineRow {
  division: string; teamRawName: string; player: string; referee: string;
  filedOn: string | null; gameId: string; gameDate: string | null; gameTime: string | null;
  misconduct: string; event: string;
}

// cautionEjectRpt.cfm (Administrative Reports -> Caution Ejection
// Reports) — a plain GET defaults to the current season and, for a
// club-rep login, to that club only (confirmed live: only ever one
// club-name section header appears, never other clubs'). Rows are
// grouped under two kinds of section header row (both colspan=7, so
// extractCells returns exactly one cell): a club-name row, then one
// "{division} - {raw team name}" row per team, followed by that team's
// data rows (7 cells: Player, Referee, Filed On, Game, Date Time,
// Misconduct, Event). Event is free text — confirmed values are
// "Cautioned" and "Sent off" (the ejection case; NOT "Ejected" despite
// the report's own name). No stable per-row ID from NCSA, so the sync
// layer dedupes on gameId+player instead.
export function parseCautionEjectReport(html: string): NcsaDisciplineRow[] {
  const results: NcsaDisciplineRow[] = [];
  let current: { division: string; teamRawName: string } | null = null;
  for (const rowHtml of allRows(html)) {
    const cells = extractCells(rowHtml);
    if (!cells.length) continue;
    if (cells.length === 1) {
      const m = cells[0].match(/^([A-Z0-9]+)\s*-\s*(.+)$/);
      if (m) current = { division: m[1].trim(), teamRawName: m[2].trim() };
      continue;
    }
    if (cells.length < 7 || !current) continue;
    const [player, referee, filedOnRaw, gameId, dateTimeRaw, misconduct, event] = cells;
    if (!/^\d+$/.test(gameId)) continue;
    const filedMatch = filedOnRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    const filedOn = filedMatch
      ? `${filedMatch[3].length === 2 ? `20${filedMatch[3]}` : filedMatch[3]}-${filedMatch[1].padStart(2, '0')}-${filedMatch[2].padStart(2, '0')}`
      : null;
    const dt = parseNcsaDateTime(dateTimeRaw);
    results.push({
      division: current.division, teamRawName: current.teamRawName,
      player: player.replace(/\[ppu\]/i, '').trim(), referee: referee.trim(),
      filedOn, gameId, gameDate: dt?.date ?? null, gameTime: dt?.time ?? null,
      misconduct: misconduct.trim(), event: event.trim(),
    });
  }
  return results;
}

export interface NcsaField {
  fieldId: string; abbreviation: string; name: string; city: string;
  hasLights: boolean; surface: 'turf' | 'grass' | null; active: boolean;
}

// fieldList.cfm?club — the club's own field directory (Administrative Area
// -> "Edit Fields and Directions"). Unlike inferring venues from game data
// (which necessarily also picks up every AWAY venue a linked team's games
// are played at), this page is the club's real fields only, by
// construction. 8 cells per row: ID (as a link), Abbreviation, Field Name
// (as a link), City, an unused blank column, Lights, Turf, Active (in a
// <span>) — extractCells strips the <A>/<span> wrappers along with
// everything else.
export function parseFieldListReport(html: string): NcsaField[] {
  const results: NcsaField[] = [];
  for (const rowHtml of allRows(html)) {
    const cells = extractCells(rowHtml);
    if (cells.length < 8 || !/^\d+$/.test(cells[0])) continue;
    const turfRaw = cells[6].toLowerCase();
    results.push({
      fieldId: cells[0], abbreviation: cells[1], name: cells[2], city: cells[3],
      hasLights: /yes/i.test(cells[5]),
      surface: turfRaw.includes('artificial') ? 'turf' : turfRaw.includes('grass') ? 'grass' : null,
      active: /active/i.test(cells[7]) && !/inactive/i.test(cells[7]),
    });
  }
  return results;
}
