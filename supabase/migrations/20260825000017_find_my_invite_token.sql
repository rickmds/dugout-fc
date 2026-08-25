-- Pre-scale multi-tenancy audit finding: "Find your team" let any signed-in
-- user browse a club by slug and self-select any team to join, with no
-- invite/code verification at all — the team_id filter was real, but
-- entirely client-chosen. This RPC replaces that: it looks up a pending
-- invite for the *caller's own authenticated email* at the given club,
-- server-side, so the client can never join a team it wasn't actually
-- invited to. The mobile screen calls this, then redeems the returned
-- token through the identity-checked accept_invite() RPC — the same path
-- the web /join flow already uses.
create or replace function public.find_my_invite_token(p_club_slug text)
returns text
language sql
security definer
stable
as $function$
  select i.token
  from public.invites i
  left join public.teams t on t.id = i.team_id
  left join public.clubs tc on tc.id = t.club_id
  left join public.clubs ic on ic.id = i.club_id
  where i.accepted_at is null
    and lower(i.email) = lower(coalesce(auth.email(), ''))
    and lower(coalesce(tc.slug, ic.slug, '')) = lower(p_club_slug)
  order by i.created_at desc
  limit 1;
$function$;

grant execute on function public.find_my_invite_token(text) to authenticated;
