// Shared helpers for the branded transactional emails (payment receipts,
// refund confirmations) sent from the Stripe webhook and refund flow.

export function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22c55e';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22c55e';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#22c55e';
  if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) return '#22c55e';
  return hex;
}

export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000000' : '#ffffff';
}

export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
