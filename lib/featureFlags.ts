// Client-side kill switches for features that are built but temporarily
// turned off — same pattern as SOCIAL_AUTH_ENABLED in lib/auth.ts. Flip
// back to true (and undo the matching flag in web/lib/featureFlags.ts,
// which gates the server side of anything that also sends notifications)
// once the feature is ready again — don't delete the surrounding code.

// Post-game player reflection prompts ("Team Pulse") — the parent-facing
// "How did today's game go?" banner, the push/notification cron
// (web/app/api/cron/reflection-prompts/route.ts), and the coach's Team
// Pulse trends screen all gate off this one flag.
export const TEAM_PULSE_ENABLED = false;

// AI Session Builder (training-event "Actions" card on the event screen,
// app/(app)/[clubSlug]/admin/events/[eventId]/session-builder.tsx) — still
// being worked on, hidden from coaches until it's ready.
export const SESSION_BUILDER_ENABLED = false;
