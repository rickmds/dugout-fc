-- conversations_select's intended "am I a participant" check was a no-op:
-- it compared conversation_participants.conversation_id to
-- conversation_participants.id (the same row's own two columns), never
-- correlating to the outer conversations.id. Real access fell through to
-- the team-membership fallback, which didn't distinguish type='direct'
-- from 'team_group' — so any DM on a team (mobile always sets team_id even
-- for direct conversations) was readable by the whole team: existence and
-- title (the other party's name) exposed, though message content stayed
-- protected by messages_select's own correct participant check.
--
-- Fixing the correlation alone would immediately orphan the one real DM
-- that exists today: it has zero conversation_participants rows (created
-- before that insert path existed, or lost some other way), so restricting
-- direct-conversation visibility to genuine participants would make it
-- unreadable by anyone, including its real two parties. Backfill
-- conversation_participants for any direct conversation missing them,
-- inferred from message senders — the only people who've actually engaged
-- in it — before tightening the policy.
insert into public.conversation_participants (conversation_id, profile_id)
select distinct m.conversation_id, m.sender_id
from public.messages m
join public.conversations c on c.id = m.conversation_id and c.type = 'direct'
where not exists (
  select 1 from public.conversation_participants cp
  where cp.conversation_id = m.conversation_id and cp.profile_id = m.sender_id
)
on conflict do nothing;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id and cp.profile_id = auth.uid()
    )
    or (team_id is not null and type <> 'direct' and is_team_member(team_id))
    or (team_id is not null and type <> 'direct' and is_team_coach(team_id))
  );
