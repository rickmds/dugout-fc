export const POSITION_COLORS: Record<string, { primary: string; bg: string; border: string }> = {
  GK:  { primary: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)'  },
  DEF: { primary: '#60A5FA', bg: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.35)'  },
  MID: { primary: '#22C55E', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.35)'   },
  FWD: { primary: '#F87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.35)' },
};

export const POSITION_DEFAULT = {
  primary: '#22C55E',
  bg:      'rgba(34,197,94,0.12)',
  border:  'rgba(34,197,94,0.28)',
};

export function positionColor(position: string | null): string {
  if (!position) return '#6B7280';
  return (POSITION_COLORS[position.toUpperCase().slice(0, 3)] ?? POSITION_DEFAULT).primary;
}
