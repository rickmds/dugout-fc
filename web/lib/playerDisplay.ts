// Shared display helpers for anywhere a player's position/initials/brand
// tint needs rendering — pulled out so the new player-profile page doesn't
// duplicate a third copy of what PlayerPanel.tsx and roster/page.tsx each
// already have their own private copy of.

export function positionStyle(pos: string | null): { color: string; bg: string } {
  if (!pos) return { color: '#94A3B8', bg: '#F8FAFC' };
  const p = pos.toLowerCase();
  if (p === 'goalkeeper' || p === 'gk') return { color: '#D97706', bg: '#FFFBEB' };
  if (['defender','cb','lb','rb','sw','wb','dm'].some(x => p.includes(x))) return { color: '#2563EB', bg: '#EFF6FF' };
  if (['midfielder','cm','am','rm','lm','cam','cdm'].some(x => p.includes(x))) return { color: '#7C3AED', bg: '#F5F3FF' };
  if (['forward','striker','winger','st','cf','lw','rw'].some(x => p.includes(x))) return { color: '#DC2626', bg: '#FFF1F1' };
  return { color: '#64748B', bg: '#F1F5F9' };
}

export function hex2rgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

export function initials(fullName: string): string {
  return fullName.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
