// Server-side kill switches for features that are built but temporarily
// turned off. Mirrors the client-side lib/featureFlags.ts in the mobile
// app — keep both in sync for a feature that has UI on one side and a
// scheduled job on the other.

// Post-game player reflection prompts ("Team Pulse") — stops
// web/app/api/cron/reflection-prompts/route.ts from sending any push
// notifications or inserting notifications rows while the parent-facing
// banner and coach trends screen are also hidden on mobile.
export const TEAM_PULSE_ENABLED = false;
