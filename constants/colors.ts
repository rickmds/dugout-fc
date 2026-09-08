export const PULSE_COLORS = {
  brand: {
    green: '#22C55E',
    greenDark: '#16A34A',
    black: '#0A0A0A',
    white: '#FFFFFF',
  },
  ui: {
    background: '#0A0A0A',
    surface: '#1A1A1A',
    surfaceAlt: '#242424',
    border: '#2E2E2E',
    muted: '#6B7280',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
  },
  status: {
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  rsvp: {
    attending: '#22C55E',
    not_attending: '#EF4444',
  },
  // Team switcher pills (age / gender tags) — one distinct, muted hue per
  // dimension so the eye can tell "this is age" from "this is gender" at a
  // glance, and boys/girls/mixed apart from each other, without the pills
  // fighting the club's own brand color for attention.
  teamTag: {
    age:   { bg: 'rgba(245,158,11,0.16)', text: '#FBBF24' },
    boys:  { bg: 'rgba(59,130,246,0.18)', text: '#60A5FA' },
    girls: { bg: 'rgba(236,72,153,0.18)', text: '#F472B6' },
    mixed: { bg: 'rgba(168,85,247,0.18)', text: '#C084FC' },
  },
} as const;
