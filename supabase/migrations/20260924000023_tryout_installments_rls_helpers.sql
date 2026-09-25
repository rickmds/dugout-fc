-- Stress-test finding #19 (Medium): "club staff select tryout_installments"
-- hand-rolled its own club-membership join instead of using the canonical
-- public.is_club_staff() helper — inconsistent with the rest of the
-- codebase, and missing the cross-club team_members coach branch that
-- is_club_staff already accounts for (a coach reaching a team at a
-- non-home club via team_members got no visibility into that team's
-- tryout payment status). Not currently exploitable (every route that
-- reads tryout_installments uses the service-role client), but a real gap
-- for any future client-side query against this table.
drop policy if exists "club staff select tryout_installments" on public.tryout_installments;
create policy "club staff select tryout_installments"
  on public.tryout_installments for select
  using (assignment_id in (
    select ta.id from public.tryout_assignments ta where public.is_club_staff(ta.club_id)
  ));
