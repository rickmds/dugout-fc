-- The 'direct' branch's permission check used a bare `profile_id` inside
-- a WHERE clause — but this function RETURNS TABLE (profile_id uuid, ...),
-- which makes `profile_id` also a PL/pgSQL variable name in scope for the
-- whole function body. Postgres can't disambiguate the column from the
-- variable and raises "column reference profile_id is ambiguous" rather
-- than guessing — which has been silently breaking sender-name lookups
-- for every direct message since this function was first added yesterday
-- (20260926000001), just never surfaced because the old client code had
-- no error branch to log it (only just added, alongside the team_group
-- fix, which is what finally exposed this).
create or replace function public.get_conversation_participant_names(p_conversation_id uuid)
returns table (profile_id uuid, full_name text)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_type text;
  v_team_id uuid;
begin
  select type, team_id into v_type, v_team_id
  from public.conversations
  where id = p_conversation_id;

  if v_type is null then
    raise exception 'Conversation not found';
  end if;

  if v_type = 'direct' then
    if not exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = p_conversation_id and cp.profile_id = auth.uid()
    ) then
      raise exception 'Not permitted';
    end if;

    return query
    select p.id, p.full_name
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = p_conversation_id;
  else
    if v_team_id is null or not (
      public.is_team_member(v_team_id) or public.is_team_coach(v_team_id)
    ) then
      raise exception 'Not permitted';
    end if;

    return query
    select pr.id, pr.full_name
    from public.team_members tm
    join public.profiles pr on pr.id = tm.profile_id
    where tm.team_id = v_team_id;
  end if;
end;
$$;
