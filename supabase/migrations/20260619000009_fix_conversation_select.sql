-- org_admin/app_admin weren't in team_members, so is_team_member returned false
-- and they couldn't see existing conversations. Bootstrap created a new one every
-- open, leaving them in a fresh empty conversation each session.
-- Adding is_team_coach (which includes org_admin/app_admin via profile role check)
-- as a third condition fixes this.
drop policy if exists "conversations_select" on public.conversations;

create policy "conversations_select" on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_participants
      where conversation_id = id and profile_id = auth.uid()
    )
    or (team_id is not null and public.is_team_member(team_id))
    or (team_id is not null and public.is_team_coach(team_id))
  );
