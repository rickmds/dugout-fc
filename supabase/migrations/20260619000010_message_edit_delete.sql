-- Add edited flag to messages
alter table public.messages add column if not exists edited boolean default false;

-- Allow users to edit their own messages
create policy "messages_update" on public.messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- Allow users to delete their own messages;
-- coaches (org_admin, app_admin, coach) can delete any message in conversations
-- they are a participant of (covers moderation of team chat)
create policy "messages_delete" on public.messages for delete
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('coach', 'org_admin', 'app_admin')
    )
  );
