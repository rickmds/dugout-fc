-- Fix cross-club data leak: scope acknowledgements reads to the current user's club
drop policy if exists "ack_admin_read" on public.field_closure_acknowledgements;
create policy "ack_admin_read" on public.field_closure_acknowledgements
  for select using (
    exists (
      select 1
      from public.field_closures fc
      join public.profiles p on p.club_id = fc.club_id
      where fc.id = field_closure_acknowledgements.closure_id
        and p.id = auth.uid()
        and p.role in ('org_admin', 'app_admin', 'coach')
    )
  );
