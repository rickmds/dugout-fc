// Shared by every "Sync to Calendar" entry point (Schedule tab, Settings ›
// My Players, Settings › My Teams) so the subscription URL can't drift out
// of sync between copies again — one of them was still hardcoded to the
// apex domain (pulse-fc.app), which Vercel permanently redirects to
// www.pulse-fc.app, so calendar clients that don't transparently follow a
// cross-subdomain 308 (or that reject it outright, same class of strictness
// as the earlier Skylight DTSTAMP issue) never received real ICS content.
export function getCalendarSyncUrls(teamId: string) {
  const base = `${process.env.EXPO_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app'}/api/calendar/${teamId}`;
  const webcal = base.replace('https://', 'webcal://');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  return { base, webcal, google };
}
