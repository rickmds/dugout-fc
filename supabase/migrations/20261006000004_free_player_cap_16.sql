-- Free's player cap was set to 12 to match the original marketing copy,
-- but real youth rosters typically run well above that — a brand-new
-- signup importing their actual roster during onboarding was hitting the
-- wall on their very first action, before experiencing any value. Raising
-- to 16. No code change needed: players_plan_limit
-- (20261006000003_enforce_team_player_limits.sql) reads plans.max_players
-- live, and no other tier differentiates on player count (every paid plan
-- is already unlimited), so there's no monetization tradeoff being made
-- here — just a better-calibrated number.
update public.plans set max_players = 16 where id = 'free';
