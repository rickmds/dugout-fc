// Shared design tokens for the public marketing site (home, clubs, coaches,
// players, pricing). Single source of truth so a palette/radius change is
// one edit instead of five — the previous version of these pages each
// hardcoded their own copy of the same colors.
//
// The dashboard app (#dashboard) and mobile app have their own, separate
// theming and do not use this file.

export const theme = {
  bg: '#FAF7F1',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EEE4',
  border: '#EDE6DA',

  text: '#2B2420',
  textSecondary: '#6B6054',
  textMuted: '#A69B8C',

  green: '#3FA86B',
  greenDark: '#2F8755',
  greenTint: 'rgba(63,168,107,0.10)',
  greenTintBorder: 'rgba(63,168,107,0.28)',

  radiusCard: 20,
  radiusBtn: 14,

  shadowCard: '0 8px 24px rgba(43,36,32,0.08)',
  shadowCardHover: '0 12px 32px rgba(43,36,32,0.12)',
  shadowBtn: '0 4px 16px rgba(63,168,107,0.30)',

  fontDisplay: 'var(--font-display)',
  fontBody: 'var(--font-body)',
} as const;
