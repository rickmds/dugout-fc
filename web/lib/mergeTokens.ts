export function mergeTokens(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (html, [key, val]) => html.replaceAll(`{{${key}}}`, val ?? ''),
    template
  );
}
