-- Suspending a club (Super Admin -> Suspend club) only ever blocked the
-- client-side UI (the mobile modal / web dashboard layout). Nothing in the
-- database itself checked suspended_at, so a suspended org_admin/coach/
-- parent's already-authenticated session could still read and write data
-- directly (any API route, or a modified/older client), completely
-- bypassing the block screen.
--
-- is_team_member / is_team_coach / is_player_guardian are the shared
-- gatekeepers behind the large majority of RLS policies in the schema (67
-- policy usages combined) — adding the suspension check inside these three
-- functions enforces it everywhere at once, instead of touching dozens of
-- individual policies. app_admin is deliberately left unconditional in all
-- three (Rick can always view/manage a suspended club via Super Admin,
-- matching the product's existing "suspend doesn't lock you, Rick, out"
-- behavior).
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer
as $function$
  select
    public.current_user_role() = 'app_admin'
    or (
      exists (
        select 1 from public.team_members
        where team_id = p_team_id and profile_id = auth.uid()
      )
      and exists (
        select 1 from public.teams t join public.clubs c on c.id = t.club_id
        where t.id = p_team_id and c.suspended_at is null
      )
    )
    or (
      public.current_user_role() = 'org_admin'
      and exists (
        select 1 from public.teams t join public.clubs c on c.id = t.club_id
        where t.id = p_team_id
          and t.club_id = public.current_user_club_id()
          and c.suspended_at is null
      )
    );
$function$;

create or replace function public.is_team_coach(p_team_id uuid)
returns boolean
language sql stable security definer
as $function$
  select
    public.current_user_role() = 'app_admin'
    or (
      exists (
        select 1 from public.team_members
        where team_id = p_team_id and profile_id = auth.uid() and role = 'coach'
      )
      and exists (
        select 1 from public.teams t join public.clubs c on c.id = t.club_id
        where t.id = p_team_id and c.suspended_at is null
      )
    )
    or (
      public.current_user_role() = 'org_admin'
      and exists (
        select 1 from public.teams t join public.clubs c on c.id = t.club_id
        where t.id = p_team_id
          and t.club_id = public.current_user_club_id()
          and c.suspended_at is null
      )
    );
$function$;

create or replace function public.is_player_guardian(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
  select p_player_id is not null and exists (
    select 1 from public.players pl
    join public.teams t on t.id = pl.team_id
    join public.clubs c on c.id = t.club_id
    where pl.id = p_player_id
      and c.suspended_at is null
      and (pl.profile_id = auth.uid() or exists (
        select 1 from public.player_guardians where player_id = p_player_id and profile_id = auth.uid()
      ))
  );
$function$;
