-- Bug in this session's own Fix #8 (20260924000021): the WITH CHECK on
-- tryout_assignments' insert/manage policies did a raw
-- `exists (select 1 from public.tryout_players tp where ...)` subquery.
-- A subquery inside a policy runs under the CURRENT querying role's row
-- security too — since tryout_players has no SELECT policy granting
-- anon (or a staff member of a DIFFERENT club) visibility into that
-- specific player row, the subquery saw zero rows and the EXISTS always
-- evaluated false, even for a legitimate same-club insert. Reproduced
-- live: the real public tryout-registration insert started failing with
-- "new row violates row-level security policy for table tryout_assignments"
-- after that migration.
--
-- Fix: same pattern already used everywhere else in this schema
-- (is_club_admin/is_club_staff) — wrap the cross-table check in a
-- SECURITY DEFINER function, which evaluates with the function owner's
-- privileges (bypassing RLS on the referenced table) rather than the
-- caller's.
create or replace function public.tryout_player_in_club(p_player_id uuid, p_club_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.tryout_players tp
    where tp.id = p_player_id and tp.club_id = p_club_id
  );
$$;

drop policy if exists "club admin manage tryout_assignments" on public.tryout_assignments;
create policy "club admin manage tryout_assignments"
  on public.tryout_assignments for all
  using (public.is_club_admin(club_id))
  with check (
    public.is_club_admin(club_id)
    and public.tryout_player_in_club(player_id, club_id)
  );

drop policy if exists "public insert tryout_assignments" on public.tryout_assignments;
create policy "public insert tryout_assignments"
  on public.tryout_assignments for insert
  with check (
    status = 'Unassigned' and offer_status = 'NotSent'
    and public.tryout_player_in_club(player_id, club_id)
  );
