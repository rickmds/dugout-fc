-- Pre-scale data-model audit finding: registration_submissions.data is a
-- schemaless jsonb blob with no database-level way to catch the same
-- family submitting twice to the same form (double-click, retry after a
-- network blip). submit_registration already correctly serializes against
-- overselling max_spots via a per-form advisory lock — this adds a
-- duplicate check inside that same locked section, so it's race-free with
-- the capacity check for free.
--
-- A single fixed jsonb key like data->>'email' won't work here: form field
-- names are club-defined per form (confirmed by reading
-- web/app/(dashboard)/dashboard/registrations/_components/shared.ts's
-- parentEmail(), which scans every value in `data` for one that looks like
-- an email address rather than trusting a fixed key). This mirrors that
-- same detection logic in SQL so the two stay consistent, rather than
-- introducing a second, different definition of "the email on this
-- submission."
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
  v_email text;
begin
  if not exists (select 1 from public.registration_forms rf where rf.id = p_form_id and rf.status = 'open') then
    raise exception 'This form is not open for submissions';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_form_id::text));

  select value into v_email from jsonb_each_text(p_data) as t(key, value)
  where value ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  limit 1;

  if v_email is not null and exists (
    select 1 from public.registration_submissions rs
    where rs.form_id = p_form_id
      and rs.status <> 'declined'
      and exists (
        select 1 from jsonb_each_text(rs.data) as e(key, value)
        where lower(trim(e.value)) = lower(trim(v_email))
      )
  ) then
    raise exception 'A submission with this email address has already been received for this form.';
  end if;

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
