-- "New Evaluation Period" (web/app/(dashboard)/dashboard/evaluations/page.tsx)
-- lets an admin pick a different coach per team, then inserts one
-- evaluation_batches row per team with that coach's id. But the INSERT
-- policy required coach_id = auth.uid() unconditionally — so every row
-- where the inserting admin wasn't themselves the picked coach was
-- rejected. Confirmed live: creating a 37-team period only succeeded for
-- the one team where the admin had picked themselves as coach.
--
-- This is a real bug in the feature as designed, not specific to one
-- club — the UI has always let an admin assign other coaches, the RLS
-- just never allowed the resulting insert. Widen it: a coach can still
-- insert their own batch directly (unchanged), and now a club admin can
-- also insert a batch on behalf of any coach in their club.

drop policy "coaches insert own batches" on public.evaluation_batches;
create policy "coach self-insert or admin insert any batch"
  on public.evaluation_batches for insert
  with check (
    (coach_id = auth.uid() and public.is_club_staff(club_id))
    or public.is_club_admin(club_id)
  );
