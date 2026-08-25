-- accept_invite had a real bug: when an existing coach/org_admin/app_admin
-- accepts a parent-role invite (e.g. for their own kid), it deliberately
-- preserves their current club_id instead of overwriting it with the
-- invite's club — correct when they already have a club, so accepting an
-- unrelated parent invite elsewhere doesn't silently move their primary
-- club. But the "preserve" branch just wrote back the bare `club_id`
-- column with no guard, so an org_admin/coach whose club_id was already
-- NULL (e.g. an org_admin who never finished the club setup wizard) had
-- that NULL preserved forever, even though this invite was their only
-- path to ever getting a real club — leaving them stuck bouncing through
-- onboarding indefinitely (found live: seth.borus@gmail.com, invite
-- accepted 2026-08-20, club_id still null 4 days later).
--
-- Fix: only preserve the existing club_id when there's actually something
-- to preserve; otherwise fall through to the invite's club like everyone
-- else.
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_invite_id    uuid;
  v_team_id      uuid;
  v_team_ids     uuid[];
  v_player_id    uuid;
  v_club_id      uuid;
  v_club_slug    text;
  v_role         text;
  v_current_role text;
begin
  select i.id, i.team_id, coalesce(i.team_ids, '{}'), i.player_id,
         coalesce(t.club_id, i.club_id), coalesce(tc.slug, ic.slug),
         coalesce(i.role, 'parent')
  into   v_invite_id, v_team_id, v_team_ids, v_player_id,
         v_club_id, v_club_slug, v_role
  from   public.invites i
  left join public.teams t  on t.id = i.team_id
  left join public.clubs tc on tc.id = t.club_id
  left join public.clubs ic on ic.id = i.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found or v_club_id is null then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  if v_team_id is not null then
    insert into public.team_members (team_id, profile_id, role)
    values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
    on conflict do nothing;
  elsif array_length(v_team_ids, 1) > 0 then
    insert into public.team_members (team_id, profile_id, role)
    select unnest(v_team_ids), auth.uid(), 'coach'
    on conflict do nothing;
  end if;

  if v_player_id is not null then
    insert into public.player_guardians (player_id, profile_id)
    values (v_player_id, auth.uid())
    on conflict do nothing;
    -- Only the first guardian claims the legacy single-column slot —
    -- later guardians never overwrite an already-linked player.
    update public.players set profile_id = auth.uid() where id = v_player_id and profile_id is null;
  end if;

  select role into v_current_role from public.profiles where id = auth.uid();

  update public.profiles
  set    role    = case
                      when v_role in ('coach', 'org_admin') then v_role
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                      else 'player'
                    end,
         club_id = case
                      when v_role in ('coach', 'org_admin') then v_club_id
                      when v_current_role in ('coach', 'org_admin', 'app_admin') and club_id is not null then club_id
                      else v_club_id
                    end
  where  id = auth.uid();

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$function$;
