// player_first_name/player_full_name/parent_name come straight from the
// public, unauthenticated tryout_players insert — escape every value before
// splicing it into the letter/email HTML, or a submitter's own name field
// becomes a markup-injection vector in mail sent to themselves and staff.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mergeTokens(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (html, [key, val]) => html.replaceAll(`{{${key}}}`, escapeHtml(val ?? '')),
    template
  );
}
