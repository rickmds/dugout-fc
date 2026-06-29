-- The conv_participants_select policy in 20260623000005 contained a self-referential
-- subquery that causes infinite recursion. Additionally, the org_admin condition
-- queried `conversations`, whose SELECT policy in turn queries `conversation_participants`
-- — creating a two-table recursive loop.
--
-- Fix: ALL table queries inside this policy must be wrapped in SECURITY DEFINER
-- functions. SECURITY DEFINER runs as the function owner (postgres superuser),
-- which bypasses RLS entirely — no policy re-evaluation, no recursion.

-- Check if current user is a participant in a given conversation (bypasses RLS)
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and profile_id = auth.uid()
  );
$$;

-- Check if a conversation belongs to the current org_admin's club (bypasses RLS)
create or replace function public.is_club_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.conversations c
    join public.teams t on t.id = c.team_id
    where c.id = p_conversation_id
      and t.club_id = public.current_user_club_id()
  );
$$;

-- Replace the broken recursive policy with one that uses only SECURITY DEFINER
-- functions — no direct table queries that could re-trigger this policy
drop policy if exists "conv_participants_select" on public.conversation_participants;
create policy "conv_participants_select" on public.conversation_participants for select
  using (
    profile_id = auth.uid()
    or public.is_conversation_participant(conversation_id)
    or public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() = 'org_admin'
      and public.is_club_conversation(conversation_id)
    )
  );

-- RPC for finding an existing direct conversation between two users.
-- Used instead of querying conversation_participants directly for another user's
-- rows (which the old policy approach would break for non-admins).
create or replace function public.find_direct_conversation(p_other_profile_id uuid)
returns uuid language sql stable security definer as $$
  select cp1.conversation_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  join public.conversations c
    on c.id = cp1.conversation_id
  where cp1.profile_id = auth.uid()
    and cp2.profile_id = p_other_profile_id
    and c.type = 'direct'
  limit 1;
$$;
