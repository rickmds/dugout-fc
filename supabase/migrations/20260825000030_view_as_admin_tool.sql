-- "View As" — lets app_admin genuinely test parent-facing flows without a
-- real parent account, by switching to a real Supabase session as an
-- actual parent profile (server-generated via the service role, never
-- faked client-side — RLS applies exactly as it would for that person).
-- Two pieces: an audit trail of who was viewed-as and when, and an RPC to
-- list a club's parents to pick from (kept server-side/RPC rather than a
-- raw client query so this doesn't depend on team_members' own RLS shape).

create table public.admin_impersonation_log (
  id uuid primary key default gen_random_uuid(),
  app_admin_id uuid references public.profiles(id) not null,
  target_profile_id uuid references public.profiles(id) not null,
  target_name text,
  started_at timestamptz default now()
);

alter table public.admin_impersonation_log enable row level security;

-- Read-only for app_admin (an audit trail, not something anyone edits from
-- the client) — rows are only ever inserted server-side via the service
-- role from web/app/api/admin/view-as, never by a client insert.
create policy "admin_impersonation_log_select" on public.admin_impersonation_log
  for select using (current_user_role() = 'app_admin');

create or replace function public.get_club_parents(p_club_id uuid)
returns table(profile_id uuid, full_name text, team_name text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if current_user_role() <> 'app_admin' then
    raise exception 'Not permitted';
  end if;

  return query
  select distinct pr.id, pr.full_name, t.name
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  join public.profiles pr on pr.id = tm.profile_id
  where t.club_id = p_club_id and tm.role = 'parent'
  order by pr.full_name;
end;
$function$;

grant execute on function public.get_club_parents(uuid) to authenticated;
