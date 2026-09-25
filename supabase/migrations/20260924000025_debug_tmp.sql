create or replace function public.__debug_tryout_players_policies()
returns table(policyname text, cmd text, qual text, with_check text)
language sql security definer as $$
  select policyname, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename = 'tryout_players';
$$;
