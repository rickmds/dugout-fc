-- Roster screen fetched a coach's phone via a direct
-- team_members -> profiles join, which profiles_select_own (the only
-- SELECT policy on profiles) blocks for anyone reading someone else's row
-- — so a parent always got a null phone back, contradicting CLAUDE.md's
-- stated invariant that a coach's phone is always visible to team parents.
-- Same shape as get_team_contacts: a SECURITY DEFINER RPC gated on team
-- membership, no per-coach opt-out (unlike a parent's
-- share_contact_with_team, coaches don't have one).
create or replace function public.get_team_coaches(p_team_id uuid)
returns table(profile_id uuid, full_name text, avatar_url text, phone text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'Not permitted';
  end if;

  return query
  select pr.id, pr.full_name, pr.avatar_url, pr.phone
  from public.team_members tm
  join public.profiles pr on pr.id = tm.profile_id
  where tm.team_id = p_team_id and tm.role = 'coach';
end;
$function$;
