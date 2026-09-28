export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  muted: string;
  text: string;
  textSecondary: string;
};

export const DARK_COLORS: ThemeColors = {
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceAlt: '#242424',
  border: '#2E2E2E',
  muted: '#6B7280',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
};

// Same Tailwind gray ramp the dark palette already draws from, mirrored
// around the midpoint — `muted` is reused verbatim since it already sits
// at an equal contrast-weight on both (~4.7:1 on white, ~4:1 on the dark
// background).
export const LIGHT_COLORS: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F3F4F6',
  surfaceAlt: '#E5E7EB',
  border: '#D1D5DB',
  muted: '#6B7280',
  text: '#111827',
  textSecondary: '#4B5563',
};

export const PULSE_COLORS = {
  brand: {
    green: '#22C55E',
    greenDark: '#16A34A',
    black: '#0A0A0A',
    white: '#FFFFFF',
  },
  // Kept wired to DARK_COLORS as a stable alias for every screen not yet
  // converted to useTheme() — see hooks/useTheme.tsx. Never edit this
  // block directly; edit DARK_COLORS above instead.
  ui: DARK_COLORS,
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
