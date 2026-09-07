-- The real root cause of "new row violates row-level security policy for
-- table conversations" when starting ANY new direct message (coach or
-- parent, either direction): chat.tsx's handleCreate() does
-- `.insert({type:'direct',...}).select('id').single()` — an INSERT ...
-- RETURNING. Postgres requires the just-inserted row to also satisfy the
-- table's SELECT policy before it can be returned. conversations_select
-- (20260825000003_fix_conversations_select_dm_leak.sql) intentionally
-- requires genuine conversation_participants membership for type='direct'
-- (its whole point was closing a DM leak — team members could otherwise
-- see the existence/title of any DM on their team). But at the moment of
-- this INSERT, no conversation_participants rows exist yet — those are
-- only added in a second, separate insert right after — so the RETURNING
-- read-back always failed the SELECT policy for EVERY new direct
-- conversation, for every role. Existing DMs work fine (found via
-- find_direct_conversation, already have participants); only creating a
-- brand new one was broken. 20260907000003's RLS widening was a real but
-- secondary fix (parents genuinely couldn't pass conversations_insert's
-- WITH CHECK either) — this migration fixes the actual, primary blocker.
--
-- Fix: do the whole create-conversation-and-add-participants sequence
-- atomically in one SECURITY DEFINER function, so there's no intermediate
-- RETURNING/select-back against a still-participant-less row. Also
-- tightens security versus today's conv_participants_insert policy, which
-- lets any coach add an arbitrary profile_id with no check they're even
-- on the team — here, only genuine current team members of p_team_id can
-- be added.

create or replace function public.create_direct_conversation(
  p_team_id uuid,
  p_participant_ids uuid[],
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_conv_id uuid;
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'Not a member of this team';
  end if;

  insert into public.conversations (team_id, type, title)
  values (p_team_id, 'direct', p_title)
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, profile_id)
  values (v_conv_id, auth.uid())
  on conflict do nothing;

  insert into public.conversation_participants (conversation_id, profile_id)
  select v_conv_id, pid
  from unnest(p_participant_ids) as pid
  where pid <> auth.uid()
    and exists (
      select 1 from public.team_members
      where team_id = p_team_id and profile_id = pid
    )
  on conflict do nothing;

  return v_conv_id;
end;
$function$;

grant execute on function public.create_direct_conversation(uuid, uuid[], text) to authenticated;
