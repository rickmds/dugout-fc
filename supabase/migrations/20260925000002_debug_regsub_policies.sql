create or replace function public.__debug_regsub_policies()
returns table(policyname text, cmd text, roles text, qual text, with_check text)
language sql security definer as $$
  select policyname, cmd, roles::text, qual, with_check
  from pg_policies
  where schemaname='public' and tablename='registration_submissions';
$$;
