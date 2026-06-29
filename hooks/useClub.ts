import { useAuth } from './useAuth';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(34,197,94,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
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

  return {
    clubName: club?.name ?? '',
    slug: club?.slug ?? '',
    logoUrl: club?.logo_url ?? null,
    tagline: (club as any)?.tagline ?? null as string | null,
    primaryColor,
    secondaryColor: club?.secondary_color ?? '#ffffff',
    /** Returns rgba(r,g,b,alpha) using the club primary color */
    rgba: (alpha: number) => hexToRgba(primaryColor, alpha),
  };
}
