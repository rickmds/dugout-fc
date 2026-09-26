-- The 20260907000001 fix for Team Chat showing "Unknown" sender names
-- granted full-ROW select on profiles to anyone sharing a conversation —
-- but RLS is row-level, not column-level, so that branch also exposed
-- phone/emergency_contact_* (added by 20260813000012) to any team parent
-- via a plain `select *` on profiles, bypassing both
-- share_contact_with_team and the purpose-built get_team_contacts() RPC
-- that exists specifically to gate phone visibility.
--
-- Fix: remove that branch (closing the leak) and replace the one real
-- thing it was for — resolving a message's sender_name in Team Chat —
-- with a narrow SECURITY DEFINER RPC that returns only full_name for a
-- conversation's own participants, mirroring get_team_contacts()'s
-- established pattern (return exactly the safe columns, not the row).

drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select
  using (
    id = auth.uid()
    or public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() in ('org_admin', 'coach')
      and (
        club_id = public.current_user_club_id()
        or exists (
          select 1 from public.team_members tm
          join public.teams t on t.id = tm.team_id
          where tm.profile_id = profiles.id
            and t.club_id = public.current_user_club_id()
        )
        or exists (
          select 1 from public.club_admins ca
          where ca.profile_id = profiles.id
            and ca.club_id = public.current_user_club_id()
        )
      )
    )
  );

create or replace function public.get_conversation_participant_names(p_conversation_id uuid)
returns table (profile_id uuid, full_name text)
language plpgsql stable security definer
set search_path = public
as $$
begin
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
end;
$$;

grant execute on function public.get_conversation_participant_names(uuid) to authenticated;
