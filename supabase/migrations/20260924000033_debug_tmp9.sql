create or replace function public.__debug_try_insert_invoker()
returns text
language plpgsql as $$
declare
  new_id uuid;
  results text := '';
begin
  begin
    insert into public.tryout_players (club_id, first_name, last_name, source, is_duplicate_flagged, maybe_flag, early_decision_request, duplicate_of)
    values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugE', 'Test', 'registration', false, false, false, null)
    returning id into new_id;
    results := results || 'E(all explicit false/null): SUCCESS ' || new_id::text || E'\n';
    delete from public.tryout_players where id = new_id;
  exception when others then
    results := results || 'E(all explicit false/null): ERROR ' || SQLSTATE || ' - ' || SQLERRM || E'\n';
  end;

  begin
    insert into public.tryout_players (club_id, first_name, last_name)
    values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugF', 'Test')
    returning id into new_id;
    results := results || 'F(no source at all, rely on default): SUCCESS ' || new_id::text || E'\n';
    delete from public.tryout_players where id = new_id;
  exception when others then
    results := results || 'F(no source at all, rely on default): ERROR ' || SQLSTATE || ' - ' || SQLERRM || E'\n';
  end;

  begin
    insert into public.tryout_players (club_id, first_name, last_name, source)
    values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugG', 'Test', 'registration'::text)
    returning id into new_id;
    results := results || 'G(source cast text): SUCCESS ' || new_id::text || E'\n';
    delete from public.tryout_players where id = new_id;
  exception when others then
    results := results || 'G(source cast text): ERROR ' || SQLSTATE || ' - ' || SQLERRM || E'\n';
  end;

  return results;
end;
$$;
grant execute on function public.__debug_try_insert_invoker() to anon;
