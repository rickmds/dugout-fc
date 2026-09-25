create or replace function public.__debug_try_insert_invoker()
returns text
language plpgsql as $$
declare
  results text := '';
  rc int;
begin
  begin
    insert into public.tryout_players (club_id, first_name, last_name, source, is_duplicate_flagged, maybe_flag, early_decision_request, duplicate_of)
    values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugH', 'Test', 'registration', false, false, false, null);
    get diagnostics rc = row_count;
    results := results || 'H(no returning): SUCCESS rows=' || rc::text || E'\n';
    delete from public.tryout_players where first_name = 'DebugH';
  exception when others then
    results := results || 'H(no returning): ERROR ' || SQLSTATE || ' - ' || SQLERRM || E'\n';
  end;

  begin
    perform set_config('row_security', 'off', true);
    insert into public.tryout_players (club_id, first_name, last_name, source)
    values ('88ff183d-5aa4-47a1-b460-741c15d0d345', 'DebugI', 'Test', 'registration');
    get diagnostics rc = row_count;
    results := results || 'I(row_security off): SUCCESS rows=' || rc::text || E'\n';
    delete from public.tryout_players where first_name = 'DebugI';
  exception when others then
    results := results || 'I(row_security off): ERROR ' || SQLSTATE || ' - ' || SQLERRM || E'\n';
  end;

  return results;
end;
$$;
grant execute on function public.__debug_try_insert_invoker() to anon;
