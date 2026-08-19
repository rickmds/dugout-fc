-- conversations has no distinct 'group' type — ad-hoc multi-person DMs are
-- stored as type='direct' too (see chat.tsx's handleCreate), so this
-- function needed to check participant count, not just type. Without it, a
-- coach starting a brand-new 1:1 DM with someone who's already in an
-- unrelated group chat together would get routed straight into that
-- group's full history instead of a new conversation.
create or replace function public.find_direct_conversation(p_other_profile_id uuid)
returns uuid
language sql stable security definer
as $$
  select cp1.conversation_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  join public.conversations c
    on c.id = cp1.conversation_id
  where cp1.profile_id = auth.uid()
    and cp2.profile_id = p_other_profile_id
    and c.type = 'direct'
    and (select count(*) from public.conversation_participants cp3 where cp3.conversation_id = cp1.conversation_id) = 2
  limit 1;
$$;
