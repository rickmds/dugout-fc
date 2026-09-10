-- Defense in depth for a real production bug: an invite was created with
-- player_id pointing to one team's player but team_id pointing to a
-- DIFFERENT team (a stale "currently active team" value leaking into the
-- invite instead of the invited player's own team — see
-- app/(app)/[clubSlug]/player/[playerId].tsx's "Add Another Guardian" fix
-- in the same commit). The guardian accepted it, got correctly linked via
-- player_guardians (keyed off player_id, unaffected), but got a
-- team_members row for the WRONG team, so she never saw that child in the
-- app at all despite the guardian link being right.
--
-- Whenever an invite names a specific player, that player's OWN team_id is
-- the one true source of which team the guardian should get access to —
-- trust it over the invite's own (possibly stale/wrong) team_id column.
-- This doesn't fix every possible way a bad invite.team_id could occur,
-- but it means accept_invite() itself can no longer be fooled by one.
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_invite_id      uuid;
  v_invite_email   text;
  v_team_id        uuid;
  v_team_ids       uuid[];
  v_player_id      uuid;
  v_player_team_id uuid;
  v_club_id        uuid;
  v_club_slug      text;
  v_role           text;
  v_current_role   text;
  v_current_club   uuid;
  v_same_home      boolean;
begin
  select i.id, i.email, i.team_id, coalesce(i.team_ids, '{}'), i.player_id,
         coalesce(t.club_id, i.club_id), coalesce(tc.slug, ic.slug),
         coalesce(i.role, 'parent'), p.team_id
  into   v_invite_id, v_invite_email, v_team_id, v_team_ids, v_player_id,
         v_club_id, v_club_slug, v_role, v_player_team_id
  from   public.invites i
  left join public.teams t   on t.id = i.team_id
  left join public.clubs tc  on tc.id = t.club_id
  left join public.clubs ic  on ic.id = i.club_id
  left join public.players p on p.id = i.player_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found or v_club_id is null then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  if lower(coalesce(v_invite_email, '')) <> lower(coalesce(auth.email(), '')) then
    return jsonb_build_object('error', 'This invite was sent to a different email address. Sign in with that account, or ask your club for a new invite.');
  end if;

  -- The invited player's own team, when there is one, always wins over
  -- whatever team_id got stored on the invite row itself.
  if v_player_team_id is not null then
    v_team_id := v_player_team_id;
  end if;

  select role, club_id into v_current_role, v_current_club from public.profiles where id = auth.uid();
  v_same_home := v_current_club is null or v_current_club = v_club_id;

  if v_team_id is not null then
    insert into public.team_members (team_id, profile_id, role)
    values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
    on conflict do nothing;
  elsif array_length(v_team_ids, 1) > 0 then
    insert into public.team_members (team_id, profile_id, role)
    select unnest(v_team_ids), auth.uid(), 'coach'
    on conflict do nothing;
  end if;

  if v_role = 'org_admin' and not v_same_home then
    insert into public.club_admins (club_id, profile_id)
    values (v_club_id, auth.uid())
    on conflict (club_id, profile_id) do nothing;
  end if;

  if v_player_id is not null then
    insert into public.player_guardians (player_id, profile_id)
    values (v_player_id, auth.uid())
    on conflict do nothing;
    update public.players set profile_id = auth.uid() where id = v_player_id and profile_id is null;
  end if;

  if v_same_home then
    update public.profiles
    set    role    = case
                        when v_role in ('coach', 'org_admin') then v_role
                        when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                        else 'player'
                      end,
           club_id = v_club_id
    where  id = auth.uid();
  end if;

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$function$;

-- Belt and suspenders: block the bad row from ever being written in the
-- first place, from ANY code path (including ones not yet written) — a
-- player-specific invite's team_id must always match that player's actual
-- team. Only fires when both are set, so team-wide invites (player_id is
-- null) are untouched.
create or replace function public.check_invite_team_matches_player()
returns trigger
language plpgsql
as $$
declare
  v_actual_team_id uuid;
begin
  if new.player_id is not null and new.team_id is not null then
    select team_id into v_actual_team_id from public.players where id = new.player_id;
    if v_actual_team_id is not null and v_actual_team_id <> new.team_id then
      raise exception 'invites.team_id (%) does not match player %''s actual team (%)',
        new.team_id, new.player_id, v_actual_team_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invites_team_matches_player on public.invites;
create trigger invites_team_matches_player
  before insert or update on public.invites
  for each row execute function public.check_invite_team_matches_player();
