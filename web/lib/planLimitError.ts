// Client-side translation of the teams_plan_limit/players_plan_limit
// trigger's custom SQLSTATEs (supabase/migrations/20261006000003_enforce_team_player_limits.sql)
// into a message safe to show a user, instead of the raw Postgres
// exception text.
export function planLimitMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null | undefined)?.code;
  if (code === 'PLN01') return "Your plan's team limit has been reached. Upgrade to add another team.";
  if (code === 'PLN02') return "Your plan's player limit has been reached. Upgrade to add more players.";
  return null;
}
