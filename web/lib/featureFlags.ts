// Server-side kill switches for features that are built but temporarily
// turned off. Mirrors the client-side lib/featureFlags.ts in the mobile
// app — keep both in sync for a feature that has UI on one side and a
// scheduled job on the other.

// Post-game player reflection prompts ("Team Pulse") — stops
// web/app/api/cron/reflection-prompts/route.ts from sending any push
// notifications or inserting notifications rows while the parent-facing
// banner and coach trends screen are also hidden on mobile.
export const TEAM_PULSE_ENABLED = false;

// Player Card ("Player Card" tab on the web player profile) — mirrors the
// mobile client-side flag of the same name (lib/featureFlags.ts). Not a
// flat kill switch: while false, the tab stays visible to app_admin only
// so testing can continue, and hidden from every coach/org_admin. Flip to
// true once ready — keep both copies in sync.
export const PLAYER_CARD_ENABLED = false;
