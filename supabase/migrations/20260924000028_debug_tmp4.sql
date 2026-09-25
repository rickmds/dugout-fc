create or replace function public.__debug_check_row()
returns table(has_insert_grant boolean, check_result boolean, sub_source boolean, sub_dup_flag boolean, sub_dup_of boolean, sub_maybe boolean, sub_early boolean, current_role_name text)
language plpgsql security definer as $$
declare
  r record;
begin
  select
    has_table_privilege('anon', 'public.tryout_players', 'INSERT') as has_insert_grant,
    ('registration'::text = 'registration'::text) as sub_source,
    (false is not true) as sub_dup_flag,
    (null::uuid is null) as sub_dup_of,
    (false is not true) as sub_maybe,
    (false is not true) as sub_early
  into r;
  return query select
    r.has_insert_grant,
    (r.sub_source and r.sub_dup_flag and r.sub_dup_of and r.sub_maybe and r.sub_early),
    r.sub_source, r.sub_dup_flag, r.sub_dup_of, r.sub_maybe, r.sub_early,
    current_user::text;
end;
$$;
