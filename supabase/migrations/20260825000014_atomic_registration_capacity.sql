-- The public registration page only checked max_spots once, at page load,
-- to decide whether to render the form at all — the actual submit just
-- did a plain insert with no re-check. Two concurrent submissions for the
-- same last remaining spot could both read the same stale spotsLeft and
-- both insert as 'pending', silently over-filling the form. Move the
-- check + insert into one atomic function: an advisory lock scoped to the
-- form serializes concurrent submissions for that form (different forms
-- never block each other), so the second submission in a race always sees
-- the first one's already-counted row and correctly falls back to
-- 'waitlisted' instead of also claiming the same spot.
create or replace function public.submit_registration(
  p_form_id uuid,
  p_data jsonb,
  p_payment_choice text,
  p_amount_due numeric
) returns table(id uuid, status text)
language plpgsql
security definer
as $$
declare
  v_max_spots int;
  v_taken int;
  v_status text := 'pending';
  v_id uuid := gen_random_uuid();
begin
  -- RETURNS TABLE(id, status) puts "id"/"status" in scope as PL/pgSQL
  -- variables for the rest of this function, shadowing the same-named
  -- columns below — every reference to those columns has to be qualified
  -- with the table name or it binds to the (empty, at this point) OUT
  -- variable instead.
  if not exists (select 1 from public.registration_forms rf where rf.id = p_form_id and rf.status = 'open') then
    raise exception 'This form is not open for submissions';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_form_id::text));

  select rf.max_spots into v_max_spots from public.registration_forms rf where rf.id = p_form_id;

  if v_max_spots is not null then
    select count(*) into v_taken from public.registration_submissions rs
      where rs.form_id = p_form_id and rs.status in ('pending', 'approved');
    if v_taken >= v_max_spots then
      v_status := 'waitlisted';
    end if;
  end if;

  insert into public.registration_submissions (id, form_id, data, status, payment_choice, payment_status, amount_due)
  values (
    v_id, p_form_id, p_data, v_status, p_payment_choice,
    case when p_amount_due is not null then 'unpaid' else null end,
    p_amount_due
  );

  return query select v_id, v_status;
end;
$$;
