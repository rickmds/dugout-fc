create or replace function public.accept_invite(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite_id   uuid;
  v_team_id     uuid;
  v_player_id   uuid;
  v_club_id     uuid;
  v_club_slug   text;
begin
  select i.id, i.team_id, i.player_id, c.id, c.slug
  into   v_invite_id, v_team_id, v_player_id, v_club_id, v_club_slug
  from   public.invites i
  join   public.teams   t on t.id = i.team_id
  join   public.clubs   c on c.id = t.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  insert into public.team_members (team_id, profile_id, role)
  values (v_team_id, auth.uid(), 'parent')
  on conflict do nothing;

  if v_player_id is not null then
    update public.players set profile_id = auth.uid() where id = v_player_id;
  end if;

  update public.profiles
  set    role = 'player', club_id = v_club_id
  where  id = auth.uid();

  update public.invites set accepted_at = now() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;
