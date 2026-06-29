-- Allow users to remove themselves from a conversation (leave / delete from list).
-- Coaches can also remove any participant from their team's conversations.
create policy "conv_participants_delete" on public.conversation_participants for delete
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      join public.teams t on t.id = c.team_id
      where c.id = conversation_id and public.is_team_coach(t.id)
    )
    or public.current_user_role() in ('org_admin', 'app_admin')
  );

-- REPLICA IDENTITY FULL ensures DELETE realtime events carry the full old row,
-- not just the primary key. Required for the filter-based subscriptions to work
-- correctly and for the subscriber to access all fields of deleted messages.
alter table public.messages replica identity full;
