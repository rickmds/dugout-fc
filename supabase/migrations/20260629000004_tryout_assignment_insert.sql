-- Allow anonymous users to create assignment row when submitting registration form
create policy "public insert tryout_assignments"
  on public.tryout_assignments for insert
  with check (true);
