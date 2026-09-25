create or replace function public.__debug_try_insert_as_anon()
returns text
language plpgsql security definer as $$
declare
  new_id uuid;
begin
  set local role anon;
  insert into public.tryout_players (club_id, first_name, last_name, source)
  values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugRole', 'Test', 'registration')
  returning id into new_id;
  reset role;
  delete from public.tryout_players where id = new_id;
  return 'SUCCESS: ' || new_id::text;
exception when others then
  reset role;
  return 'ERROR: ' || SQLSTATE || ' - ' || SQLERRM;
end;
$$;
