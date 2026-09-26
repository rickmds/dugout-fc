-- 20260926000001 removed the broad "anyone sharing a conversation can read
-- a full profiles row" branch (it leaked phone/emergency-contact data) and
-- replaced the ONE call site that prompted that original Sept 7 fix — Team
-- Chat's message sender name. It missed three sibling call sites that
-- depended on the exact same removed branch: the conversation screen's DM
-- header title, its "who reacted" sheet, and — in the chats list screen —
-- the DM list's other-participant names, the new-chat team-member picker,
-- and announcement author names. All went back to showing blank/"Unknown"
-- names, i.e. the identical symptom the Sept 7 fix was for, just for
-- different screens this time.
--
-- Two new narrow, name-only RPCs (same SECURITY DEFINER pattern as
-- get_team_contacts/get_team_coaches/get_conversation_participant_names)
-- cover the remaining cases instead of one-off single-conversation calls:

-- Every profile who shares at least one conversation with the caller —
-- the conversation-list equivalent of get_conversation_participant_names
-- (which is scoped to one conversation at a time). This is the same scope
-- the old broad profiles_select_own branch covered, just name-only.
create or replace function public.get_my_conversation_participant_names()
returns table (profile_id uuid, full_name text)
language sql stable security definer
set search_path = public
as $$
  select distinct p.id, p.full_name
  from public.conversation_participants cp_self
  join public.conversation_participants cp_other
    on cp_other.conversation_id = cp_self.conversation_id
  join public.profiles p on p.id = cp_other.profile_id
  where cp_self.profile_id = auth.uid();
$$;

grant execute on function public.get_my_conversation_participant_names() to authenticated;

-- Every team_members profile on a team, any role (coaches AND parents) —
-- broader than get_team_coaches (coaches only), needed for the "start a
-- new chat" picker and for resolving an announcement's author name to
-- anyone on that team, not just other coaches.
create or replace function public.get_team_member_names(p_team_id uuid)
returns table (profile_id uuid, full_name text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'Not permitted';
  end if;

  return query
  select pr.id, pr.full_name
  from public.team_members tm
  join public.profiles pr on pr.id = tm.profile_id
  where tm.team_id = p_team_id;
end;
$$;

grant execute on function public.get_team_member_names(uuid) to authenticated;
