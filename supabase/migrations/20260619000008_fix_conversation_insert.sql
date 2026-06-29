-- Allow any team member to create the shared team_group conversation.
-- Previously only coaches could, so if a parent opened chat first the
-- conversation was never created and sending silently failed.
drop policy if exists "conversations_insert" on public.conversations;

create policy "conversations_insert" on public.conversations for insert
  with check (
    team_id is null
    or public.is_team_coach(team_id)
    or (type = 'team_group' and public.is_team_member(team_id))
  );
