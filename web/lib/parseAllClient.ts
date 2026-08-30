// Shared client for /api/ai/parse-all — used by the onboarding wizard and
// the dashboard's AI Roster/Schedule Import so every AI document import in
// the app goes through the one hardened pipeline (structured outputs,
// Excel support, chunking, alias-aware team matching, per-file failure
// reporting) instead of each caller reinventing a weaker version.

export type ParseAllPayload = { base64?: string; mimeType?: string; text?: string; name: string };
export type ParseAllCounts = { teams: number; players: number; events: number; coaches: number };
export type ParseAllFileOutcome = { name: string; ok: boolean; error?: string };
export type ExtractedTeam = { name: string; alt_names: string[]; age_group: string; gender: string; confidence: string };
export type ExtractedPlayer = {
  full_name: string; jersey_number: string; position: string; date_of_birth: string;
  parent_name: string; parent_email: string; parent_name_secondary: string; parent_email_secondary: string;
  team_name: string; confidence: string;
};
export type ExtractedCoach = { full_name: string; email: string; team_name: string; confidence: string };
export type ExtractedEvent = {
  title: string; type: string; home_away: string; event_date: string; event_time: string;
  location: string; address: string; uniform: string; duration_minutes: string; arrival_buffer_minutes: string;
  field_notes: string; field_type: string; notes: string; coach_notes: string; team_name: string; confidence: string;
};

// A player/event/coach's team_name might be either an extracted team's
// primary name OR one of its alt_names (a document can call the same team
// two different things) — check both, not just the primary name.
export function matchExtractedTeam(name: string | undefined, extracted: ExtractedTeam[]): ExtractedTeam | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const names = (t: ExtractedTeam) => [t.name, ...(t.alt_names ?? [])].filter(Boolean);
  return extracted.find((t) => names(t).some((x) => x.toLowerCase().trim() === n))
    ?? extracted.find((t) => names(t).some((x) => x.toLowerCase().includes(n) || n.includes(x.toLowerCase())))
    ?? null;
}

export function confToUncertain(confidence: string | undefined): { uncertain: boolean; reason: string | null } {
  if (confidence === 'low') return { uncertain: true, reason: 'Low confidence — please verify' };
  if (confidence === 'medium') return { uncertain: true, reason: 'Some fields inferred by AI' };
  return { uncertain: false, reason: null };
}

// CSV/plain text goes as-is (Claude reads it as text and the deterministic
// parser can look at it directly); everything else — images, PDF, Excel —
// goes as base64 so the server can either hand it to Claude natively
// (image/PDF) or convert it (Excel → CSV) before parsing.
export async function toParseAllPayload(file: File): Promise<ParseAllPayload> {
  const mimeType = file.type || 'text/plain';
  if (mimeType === 'text/csv' || mimeType === 'text/plain' || file.name.endsWith('.csv')) {
    return { text: await file.text(), name: file.name };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => { const r = reader.result as string; resolve({ base64: r.split(',')[1], mimeType, name: file.name }); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// /api/ai/parse-all streams newline-delimited JSON progress as each file's
// extraction finishes, ending with one {"type":"done",...} line — reads it
// incrementally so callers can show real counts climbing instead of a
// decorative animation with no relationship to actual work.
export async function streamParseAll(
  payloads: ParseAllPayload[],
  token: string | undefined,
  signal?: AbortSignal,
  onProgress?: (counts: ParseAllCounts) => void,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch('/api/ai/parse-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ files: payloads }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try { const body = await res.json(); if (body?.error) message = body.error; } catch { /* not JSON */ }
    return { ok: false, error: message };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData: Record<string, unknown> | null = null;
  let streamError: string | null = null;

  // The server is expected to emit at least one line (progress, done, or
  // error) periodically as each file finishes — if the stream goes fully
  // silent for this long, something on the server hung and the "Scanning
  // your files" screen would otherwise spin forever with no way out short
  // of the Back button. This resets on every line received, not just once.
  const IDLE_TIMEOUT_MS = 120_000;

  try {
    for (;;) {
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('stream_idle_timeout')), IDLE_TIMEOUT_MS)),
      ]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.trim()) continue;
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'progress') {
          onProgress?.({
            teams:   Number(msg.teams)   || 0, players: Number(msg.players) || 0,
            events:  Number(msg.events)  || 0, coaches: Number(msg.coaches) || 0,
          });
        } else if (msg.type === 'done') {
          finalData = msg;
        } else if (msg.type === 'error') {
          streamError = typeof msg.error === 'string' ? msg.error : 'Unknown error';
        }
      }
    }
  } catch (e) {
    reader.cancel().catch(() => {});
    if (e instanceof Error && e.message === 'stream_idle_timeout') {
      return { ok: false, error: 'This is taking longer than expected — the import seems to have stalled. Please try again or add files manually.' };
    }
    throw e;
  }

  if (streamError) return { ok: false, error: streamError };
  if (!finalData) return { ok: false, error: 'No response received' };
  return { ok: true, data: finalData };
}
