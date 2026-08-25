-- Inner-joined teams, so a club-wide invite (org_admin, or a coach not
-- tied to a single team — team_id null) never showed up in the "we found
-- your invite" auto-match card on first sign-in; that meant a club admin
-- signing up with their invited email would silently fall through to the
-- generic role picker/create-a-club flow instead of joining the club they
-- were actually invited to. LEFT JOIN + fall back to invites.club_id.
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
    coalesce(tc.name, ic.name),
    i.role
  from public.invites i
  left join public.teams t  on t.id = i.team_id
  left join public.clubs tc on tc.id = t.club_id
  left join public.clubs ic on ic.id = i.club_id
  left join public.players p on p.id = i.player_id
  where i.accepted_at is null
    and i.email is not null
    and lower(i.email) = lower(coalesce(auth.email(), ''))
    and coalesce(t.club_id, i.club_id) is not null
$$;
