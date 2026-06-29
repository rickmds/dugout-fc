-- org_admin could already write to any team in their club (is_team_coach included
-- the role check), but is_team_member did not, so SELECT policies on players,
-- events, RSVPs, lineups, announcements, and chat all blocked org_admins who
-- weren't explicitly added to team_members for every team.
--
-- Fix 1: extend is_team_member so org_admin returns true for any team in their
-- club, and app_admin returns true for any team globally.
--
-- This single change cascades to fix:
--   players_select, team_members_select, events_select, rsvps_select,
--   rsvps_insert, lineups_select, lineup_positions_select, sub_plans_select,
--   announcements_select, conversations_select (is_team_member branch)
--
-- Fix 2: messages and conversation_participants don't use is_team_member at all
-- (they check conversation_participants table directly), so they need separate
-- policy updates.

-- ── Fix 1: is_team_member ──────────────────────────────────────────────────

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and profile_id = auth.uid()
  )
  or public.current_user_role() = 'app_admin'
  or (
    public.current_user_role() = 'org_admin'
    and exists (
      select 1 from public.teams t
      where t.id = p_team_id
        and t.club_id = public.current_user_club_id()
    )
  );
$$;

-- ── Fix 2: messages ────────────────────────────────────────────────────────

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select
  using (
    exists (
      select 1 from public.conversation_participants
      where conversation_id = messages.conversation_id and profile_id = auth.uid()
    )
    or public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() = 'org_admin'
      and exists (
        select 1 from public.conversations c
        join public.teams t on t.id = c.team_id
        where c.id = messages.conversation_id
          and t.club_id = public.current_user_club_id()
      )
    )
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (
      exists (
        select 1 from public.conversation_participants
        where conversation_id = messages.conversation_id and profile_id = auth.uid()
      )
      or public.current_user_role() = 'app_admin'
      or (
        public.current_user_role() = 'org_admin'
        and exists (
          select 1 from public.conversations c
          join public.teams t on t.id = c.team_id
          where c.id = messages.conversation_id
            and t.club_id = public.current_user_club_id()
        )
      )
    )
  );

-- ── Fix 3: conversation_participants ───────────────────────────────────────

drop policy if exists "conv_participants_select" on public.conversation_participants;
create policy "conv_participants_select" on public.conversation_participants for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()
    )
    or public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() = 'org_admin'
      and exists (
        select 1 from public.conversations c
        join public.teams t on t.id = c.team_id
        where c.id = conversation_id
          and t.club_id = public.current_user_club_id()
      )
    )
  );
