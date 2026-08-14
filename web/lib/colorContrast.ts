// Shared WCAG-ish contrast helpers. Used anywhere a club's own brand color
// gets rendered as text/icon color on a fixed dark panel (sidebar, onboarding
// scoreboards) — a club can pick any hex, including one that's unreadable
// against that fixed background, so callers need a safe fallback rather
// than trusting the raw color.

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [lA, lB] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lA + 0.05) / (lB + 0.05);
}

// Picks black or white text depending on which reads better on `hex`.
export function contrastText(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#0F172A' : '#fff';
}

// Falls back to `fallback` whenever `hex` wouldn't be legible against `bg`.
export function safeAccent(hex: string, bg: string, fallback = '#22C55E'): string {
  return /^#[0-9a-f]{6}$/i.test(hex) && contrastRatio(hex, bg) >= 2.5 ? hex : fallback;
}
