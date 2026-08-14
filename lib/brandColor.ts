// Same guard already proven server-side in web/app/api/send-fee-reminder/route.ts's
// resolveAccent — a club that hasn't picked a color yet (or picked pure
// black/white, which reads as "unset" against our dark UI) falls back to
// Pulse green instead of an invisible or jarring accent.
export function resolveAccent(hex: string | null | undefined, fallback = '#22C55E'): string {
  if (!hex) return fallback;
  const h = hex.replace('#', '');
  if (h.length !== 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
  if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) return fallback;
  return hex;
}

export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 145 ? '#000000' : '#ffffff';
}

export function clubInitials(name: string | null | undefined): string {
  if (!name) return 'FC';
  return name.split(' ').slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('') || 'FC';
}
