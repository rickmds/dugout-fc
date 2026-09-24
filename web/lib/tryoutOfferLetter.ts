export type LetterRow = { age_group: string; subject: string | null; from_name: string | null; body_html: string | null };
export type ResolvedLetter = { subject: string; fromName: string; bodyHtml: string };

// Each field (subject/from name/body) independently falls back to the ''
// (default) row when an age-group-specific row doesn't set it, so a club
// can override just the body for one age group while keeping the same
// subject/sender everywhere, or override everything, or nothing at all.
export function resolveOfferLetter(
  ageGroup: string | null,
  lettersByAgeGroup: Record<string, LetterRow>,
  fallbackSubject: string,
  fallbackFromName: string,
): ResolvedLetter {
  const ageTmpl = (ageGroup && lettersByAgeGroup[ageGroup]) || null;
  const defaultTmpl = lettersByAgeGroup[''] || null;
  return {
    subject: ageTmpl?.subject || defaultTmpl?.subject || fallbackSubject,
    fromName: ageTmpl?.from_name || defaultTmpl?.from_name || fallbackFromName,
    bodyHtml: ageTmpl?.body_html || defaultTmpl?.body_html || '',
  };
}

export function lettersToMap(rows: LetterRow[]): Record<string, LetterRow> {
  const map: Record<string, LetterRow> = {};
  for (const r of rows) map[r.age_group] = r;
  return map;
}
