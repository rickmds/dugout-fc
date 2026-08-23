-- Emoji reactions on chat messages (Team Chat + DMs). conversation_id is
-- denormalized from messages.conversation_id (rather than joining through
-- messages for every check) so RLS and realtime filters can key off it
-- directly, matching how conversation_participants already works.
create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade not null,
  conversation_id uuid references conversations(id) on delete cascade not null,
  profile_id uuid references profiles(id) not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique(message_id, profile_id, emoji)
);

create index if not exists message_reactions_conversation_idx on message_reactions(conversation_id);
create index if not exists message_reactions_message_idx on message_reactions(message_id);

alter table message_reactions enable row level security;

create policy "Participants can view reactions"
  on message_reactions for select
  using (
    conversation_id in (select conversation_id from conversation_participants where profile_id = auth.uid())
  );

create policy "Participants can add their own reaction"
  on message_reactions for insert
  with check (
    profile_id = auth.uid()
    and conversation_id in (select conversation_id from conversation_participants where profile_id = auth.uid())
  );

create policy "Users can remove their own reaction"
  on message_reactions for delete
  using (profile_id = auth.uid());
