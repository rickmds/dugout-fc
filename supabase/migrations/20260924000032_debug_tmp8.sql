create or replace function public.__debug_try_insert_invoker()
returns text
language plpgsql as $$
declare
  new_id uuid;
begin
  insert into public.tryout_players (club_id, first_name, last_name, source)
  values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugRole', 'Test', 'registration')
  returning id into new_id;
  return 'SUCCESS: ' || new_id::text;
exception when others then
  return 'ERROR: ' || SQLSTATE || ' - ' || SQLERRM;
end;
$$;
grant execute on function public.__debug_try_insert_invoker() to anon;
