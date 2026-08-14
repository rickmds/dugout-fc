-- Lets a freshly-authenticated user discover a pending invite by their own
-- auth email, so they don't have to hunt down a code from an email they
-- may have already archived. Returns every unaccepted invite (handles the
-- sibling case — two children, two rows) matching the caller's own email;
-- scoped by auth.email() so a user can never see another email's invites.
create or replace function public.find_my_pending_invites()
returns table (
  invite_id uuid,
  token text,
  player_name text,
  team_name text,
  club_name text,
  invite_role text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.id,
    i.token,
    p.full_name,
    t.name,
    c.name,
    i.role
  from public.invites i
  join public.teams t on t.id = i.team_id
  join public.clubs c on c.id = t.club_id
  left join public.players p on p.id = i.player_id
  where i.accepted_at is null
    and i.email is not null
    and lower(i.email) = lower(coalesce(auth.email(), ''))
$$;

grant execute on function public.find_my_pending_invites() to authenticated;
