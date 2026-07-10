import { useAuth } from './useAuth';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(34,197,94,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Returns '#000' or '#fff' — whichever is more readable on top of the given hex color. */
function contrastOn(hex: string): '#000000' | '#ffffff' {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#000000';
  // Relative luminance (WCAG formula)
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.179 ? '#000000' : '#ffffff';
}

const FALLBACK_PRIMARY = '#22C55E';

export function useClub() {
  const { club } = useAuth();
  const raw = club?.primary_color ?? null;
  // Avoid using the schema defaults (#000000 / #ffffff) as the accent color
  const primaryColor =
    raw && raw !== '#000000' && raw !== '#000' && raw !== '#ffffff' && raw !== '#fff'
      ? raw
      : FALLBACK_PRIMARY;

  const secondaryColor = club?.secondary_color ?? '#ffffff';

  const homeKitColor     = (club as any)?.home_kit_color     ?? primaryColor;
  const awayKitColor     = (club as any)?.away_kit_color     ?? secondaryColor;
  const trainingKitColor = (club as any)?.training_kit_color ?? '#F97316';

  return {
    clubName: club?.name ?? '',
    slug: club?.slug ?? '',
    logoUrl: club?.logo_url ?? null,
    tagline: (club as any)?.tagline ?? null as string | null,
    primaryColor,
    secondaryColor,
    homeKitColor,
    awayKitColor,
    trainingKitColor,
    /** '#000' or '#fff' — whichever reads better on top of secondaryColor */
    onSecondary: contrastOn(secondaryColor),
    /** Returns rgba(r,g,b,alpha) using the club primary color */
    rgba: (alpha: number) => hexToRgba(primaryColor, alpha),
    /** Returns rgba(r,g,b,alpha) using the club secondary color */
    secondaryRgba: (alpha: number) => hexToRgba(secondaryColor, alpha),
    headerPattern: ((club as any)?.header_pattern ?? 'stripes') as 'solid' | 'stripes' | 'pinstripes' | 'dots' | 'grid' | 'hoops' | 'vstripes' | 'sash' | 'halves' | 'diamond',
  };
}
