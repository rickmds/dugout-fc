-- get_conversation_participant_names (added in 20260926000001) checked and
-- sourced names entirely from conversation_participants — correct for
-- 'direct' conversations, but wrong for 'team_group'/'announcement': those
-- are actually gated by team membership (see conversations_select:
-- `type <> 'direct' and (is_team_member(team_id) or is_team_coach(team_id))`),
-- and conversation_participants for them is only ever populated lazily, per
-- viewer, as a side effect of that viewer personally opening this exact
-- screen (see the client's own upsert-on-open). So the RPC's returned name
-- set for Team Chat was never a real roster — only whichever subset of
-- members had individually opened the screen before — and on a brand new
-- viewer's very first open, the permission check could lose a race against
-- their own lazy upsert and raise 'Not permitted' entirely, silently (a
-- Postgres exception from an RPC resolves as {data: null, error} in
-- supabase-js, it doesn't throw), rendering every sender as "Unknown".
--
-- Fix: branch by conversation type. 'direct' keeps the existing
-- participant-row-based check. Everything else checks real team membership
-- and returns the real team roster from team_members, matching
-- conversations_select's own access model exactly.
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
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id and profile_id = auth.uid()
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
