-- Stress-test findings #3/#6 (High): both create-installments routes
-- (registration and tryout) used a plain "select existing rows, insert if
-- none" check with no lock and no unique constraint — two concurrent calls
-- for the same submission/assignment (a double-click, or a retried
-- fetch after a slow response) could both see zero existing rows and both
-- insert, producing two full duplicate payment schedules.
--
-- Same fix pattern already used by submit_registration: a per-row advisory
-- xact lock (hashtext of the parent id) serializes the check-then-insert
-- so the second concurrent caller blocks until the first's insert commits,
-- then sees the now-existing rows and returns those instead of inserting
-- again. The dollar-amount/date computation itself stays in the route
-- (business logic, not worth moving into SQL) — only the unsafe
-- check-then-insert step moves into a locked RPC.

create or replace function public.create_registration_installments_if_absent(
  p_submission_id uuid,
  p_rows jsonb
) returns table(payment_token uuid, amount numeric, due_date date, paid_at timestamptz)
language plpgsql
security definer
as $$
begin
  perform pg_advisory_xact_lock(hashtext('registration_installments:' || p_submission_id::text));

  if exists (select 1 from public.registration_installments ri where ri.submission_id = p_submission_id) then
    return query
      select ri.payment_token, ri.amount, ri.due_date, ri.paid_at
      from public.registration_installments ri
      where ri.submission_id = p_submission_id
      order by ri.due_date asc;
    return;
  end if;

  insert into public.registration_installments (submission_id, amount, due_date)
  select p_submission_id, (r->>'amount')::numeric, (r->>'due_date')::date
  from jsonb_array_elements(p_rows) as r;

  return query
    select ri.payment_token, ri.amount, ri.due_date, ri.paid_at
    from public.registration_installments ri
    where ri.submission_id = p_submission_id
    order by ri.due_date asc;
end;
$$;

create or replace function public.create_tryout_installments_if_absent(
  p_assignment_id uuid,
  p_rows jsonb
) returns table(payment_token uuid, amount numeric, due_date date, paid_at timestamptz)
language plpgsql
security definer
as $$
begin
  perform pg_advisory_xact_lock(hashtext('tryout_installments:' || p_assignment_id::text));

  if exists (select 1 from public.tryout_installments ti where ti.assignment_id = p_assignment_id) then
    return query
      select ti.payment_token, ti.amount, ti.due_date, ti.paid_at
      from public.tryout_installments ti
      where ti.assignment_id = p_assignment_id
      order by ti.due_date asc;
    return;
  end if;

  insert into public.tryout_installments (assignment_id, label, amount, due_date)
  select p_assignment_id, r->>'label', (r->>'amount')::numeric, (r->>'due_date')::date
  from jsonb_array_elements(p_rows) as r;

  return query
    select ti.payment_token, ti.amount, ti.due_date, ti.paid_at
    from public.tryout_installments ti
    where ti.assignment_id = p_assignment_id
    order by ti.due_date asc;
end;
$$;
