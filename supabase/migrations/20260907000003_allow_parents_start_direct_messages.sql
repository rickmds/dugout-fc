-- The mobile "New Message" flow (chat.tsx openNewChat/handleCreate) has
-- never been coach-gated: the compose FAB is visible to every team member
-- and the recipient picker lists the whole roster, coaches and parents
-- alike. But conversations_insert only ever allowed is_team_coach(team_id)
-- to create a type='direct' conversation, and conv_participants_insert
-- only let a coach add someone else's participant row — so any parent
-- tapping the FAB got "new row violates row-level security policy for
-- table conversations" the moment they tried to message anyone, coach or
-- fellow parent. Widen both to any current team member, matching what the
-- client already builds and offers.

drop policy if exists "conversations_insert" on public.conversations;

create policy "conversations_insert" on public.conversations for insert
  with check (
    team_id is null
    or public.is_team_coach(team_id)
    or (type in ('team_group', 'direct') and public.is_team_member(team_id))
  );

drop policy if exists "conv_participants_insert" on public.conversation_participants;

create policy "conv_participants_insert" on public.conversation_participants for insert
  with check (profile_id = auth.uid() or exists (
    select 1 from public.conversations c
    join public.teams t on t.id = c.team_id
    where c.id = conversation_id
      and (public.is_team_coach(t.id) or public.is_team_member(t.id))
  ));
