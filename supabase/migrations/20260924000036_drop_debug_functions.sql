-- Cleanup: drop the temporary diagnostic functions created while tracing
-- the RLS bugs fixed in 20260924000035 (never referenced by app code).
drop function if exists public.__debug_tryout_players_policies();
drop function if exists public.__debug_tryout_players_defaults();
drop function if exists public.__debug_check_row();
drop function if exists public.__debug_policy_roles();
drop function if exists public.__debug_triggers();
drop function if exists public.__debug_try_insert_as_anon();
drop function if exists public.__debug_try_insert_invoker();
