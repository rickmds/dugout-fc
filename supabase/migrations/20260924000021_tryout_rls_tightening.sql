-- Stress-test findings #8 and #10 (Medium) — two RLS gaps in the tryout
-- module, same bug class already fixed for waiver_signatures/tryout_assignments'
-- insert policy in 20260816000003 (a policy scoped to "is this role allowed"
-- instead of "is this role allowed for THIS specific resource").

-- #8: "club admin manage tryout_assignments" had no WITH CHECK cross-referencing
-- tryout_players.club_id — an org_admin of Club A could insert/update an
-- assignment row with club_id = their own club but player_id pointing at a
-- tryout_players row that actually belongs to Club B (a foreign player id is
-- enough; no other club-scoping catches this since players and assignments
-- are two separate is_club_admin(club_id) checks that never cross-reference
-- each other). Same gap exists in the public insert policy used by the
-- unauthenticated tryout-registration form.
drop policy if exists "club admin manage tryout_assignments" on public.tryout_assignments;
create policy "club admin manage tryout_assignments"
  on public.tryout_assignments for all
  using (public.is_club_admin(club_id))
  with check (
    public.is_club_admin(club_id)
    and exists (select 1 from public.tryout_players tp where tp.id = player_id and tp.club_id = club_id)
  );

drop policy if exists "public insert tryout_assignments" on public.tryout_assignments;
create policy "public insert tryout_assignments"
  on public.tryout_assignments for insert
  with check (
    status = 'Unassigned' and offer_status = 'NotSent'
    and exists (select 1 from public.tryout_players tp where tp.id = player_id and tp.club_id = club_id)
  );

-- #10: "public insert tryout_players" was bare `with check (true)` — the one
-- legitimate caller (web/app/tryout-registration/page.tsx) never sets the
-- internal staff-workflow fields below and always sends
-- source='registration', so requiring their column defaults here matches
-- real usage exactly while blocking a direct-insert forgery from marking
-- itself pre-vetted (e.g. maybe_flag=true to jump a queue, or duplicate_of
-- pointing at an arbitrary player to merge/hide a real submission).
drop policy if exists "public insert tryout_players" on public.tryout_players;
create policy "public insert tryout_players"
  on public.tryout_players for insert
  with check (
    source = 'registration'
    and is_duplicate_flagged is not true
    and duplicate_of is null
    and maybe_flag is not true
    and early_decision_request is not true
  );
