create or replace function public.__debug_policy_roles()
returns table(policyname text, roles text, permissive text)
language sql security definer as $$
  select policyname, roles::text, permissive
  from pg_policies
  where schemaname='public' and tablename='tryout_players' and cmd='INSERT';
$$;
