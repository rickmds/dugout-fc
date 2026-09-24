export type LetterRow = { subject: string | null; from_name: string | null; body_html: string | null };
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

// Fans a band's members out into individual lookup keys, so one letter
// row covering ['U9','U10','U11'] resolves for any one of those age
// groups — resolveOfferLetter() itself needs no change to support merged
// age groups.
export function lettersToMap(rows: (LetterRow & { age_groups: string[] })[]): Record<string, LetterRow> {
  const map: Record<string, LetterRow> = {};
  for (const r of rows) {
    if (!r.age_groups || r.age_groups.length === 0) { map[''] = r; continue; }
    for (const ag of r.age_groups) map[ag] = r;
  }
  return map;
}
