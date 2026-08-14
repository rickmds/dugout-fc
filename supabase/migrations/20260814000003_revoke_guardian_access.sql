-- Removing a guardian from the player detail screen's Guardians tab only
-- ever deleted the historical `invites` row — for an already-accepted
-- guardian, that's cosmetic: their real access lives in `player_guardians`
-- (every RLS policy keyed on is_player_guardian() checks that table, not
-- invites), so "remove" didn't actually revoke anything. Need to know
-- WHO accepted a given invite to know whose player_guardians row to drop;
-- invites never recorded that (only the primary's slot on players.profile_id
-- was ever tracked). Adding it now, going forward via accept_invite, and
-- backfilling existing accepted invites by matching auth.users.email —
-- accessible here since migrations run outside RLS/PostgREST.

alter table invites add column if not exists accepted_by uuid references profiles(id);

update invites i
set accepted_by = u.id
from auth.users u
where i.accepted_at is not null
  and i.accepted_by is null
  and lower(u.email) = lower(i.email);

create or replace function public.accept_invite(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite_id    uuid;
  v_team_id      uuid;
  v_player_id    uuid;
  v_club_id      uuid;
  v_club_slug    text;
  v_role         text;
  v_current_role text;
begin
  select i.id, i.team_id, i.player_id, c.id, c.slug, coalesce(i.role, 'parent')
  into   v_invite_id, v_team_id, v_player_id, v_club_id, v_club_slug, v_role
  from   public.invites i
  join   public.teams   t on t.id = i.team_id
  join   public.clubs   c on c.id = t.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  insert into public.team_members (team_id, profile_id, role)
  values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
  on conflict do nothing;

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
                      when v_role = 'coach' then 'coach'
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                      else 'player'
                    end,
         club_id = case
                      when v_role = 'coach' then v_club_id
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then club_id
                      else v_club_id
                    end
  where  id = auth.uid();

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$$;

-- No DELETE policy existed on player_guardians at all (default deny) —
-- any current guardian of the same child, or a coach of the team, can
-- remove another guardian's access. Never lets someone remove their own
-- row through this path by accident-of-scope: that's still covered since
-- self-removal is a valid case too (a guardian stepping back).
create policy "player_guardians_delete" on player_guardians
  for delete
  using (
    is_player_guardian(player_id)
    or exists (
      select 1 from players p where p.id = player_guardians.player_id and is_team_coach(p.team_id)
    )
  );
