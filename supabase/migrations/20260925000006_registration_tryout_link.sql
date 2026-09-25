-- Links the Registration Hub to the Tryout module for clubs that use the
-- Season Registration form as their post-tryout-acceptance registration,
-- replacing the built-in /register-offer form. Nullable throughout — a
-- club/form with no tryout link keeps working exactly as before.

-- Which Registration Hub form an accepted tryout offer should send the
-- family to next, instead of the built-in /register-offer form.
alter table public.tryout_offer_settings
  add column if not exists post_acceptance_form_id uuid references public.registration_forms(id) on delete set null;

-- The real, tracked link (not name/email matching) between a submission
-- and the tryout assignment it came from — lets the dashboard show which
-- team (from the Team Builder) this registrant actually belongs to.
alter table public.registration_submissions
  add column if not exists tryout_assignment_id uuid references public.tryout_assignments(id) on delete set null;

create index if not exists registration_submissions_tryout_assignment_id_idx
  on public.registration_submissions(tryout_assignment_id);

-- submit_registration now optionally resolves + stores that link.
-- p_tryout_offer_token is validated server-side (must be a real, accepted
-- offer belonging to the SAME club as the form) rather than trusted as a
-- bare id, the same reasoning as every other client input this RPC
-- resolves itself (see 20260924000018_registration_server_side_pricing.sql).
create or replace function public.submit_registration(
  p_form_id uuid,
  p_data jsonb,
  p_payment_choice text,
  p_amount_due numeric,
  p_tryout_offer_token uuid default null
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
  v_price_mode text;
  v_price numeric;
  v_price_tiers jsonb;
  v_amount_due numeric;
  v_selected_tier text;
  v_field_answer text;
  v_club_id uuid;
  v_tryout_assignment_id uuid;
begin
  select rf.max_spots, rf.price, rf.price_mode, rf.price_tiers, rf.club_id
    into v_max_spots, v_price, v_price_mode, v_price_tiers, v_club_id
  from public.registration_forms rf
  where rf.id = p_form_id and rf.status = 'open';

  if not found then
    raise exception 'This form is not open for submissions';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_form_id::text));

  if p_tryout_offer_token is not null then
    select ta.id into v_tryout_assignment_id
    from public.tryout_assignments ta
    where ta.offer_token = p_tryout_offer_token
      and ta.offer_status = 'Accepted'
      and ta.club_id = v_club_id
    limit 1;
  end if;

  v_price_mode := coalesce(v_price_mode, 'flat');

  if v_price_mode = 'flat' then
    v_amount_due := v_price;
  elsif v_price_mode = 'tiers' then
    v_selected_tier := p_data->>'__selected_tier';
    if v_selected_tier is not null and v_price_tiers is not null then
      select (tier->>'price')::numeric into v_amount_due
      from jsonb_array_elements(v_price_tiers) as tier
      where tier->>'label' = v_selected_tier
      limit 1;
    end if;
  elsif v_price_mode = 'field' then
    if v_price_tiers is not null and v_price_tiers ? 'field' then
      v_field_answer := p_data->>(v_price_tiers->>'field');
      if v_field_answer is not null then
        v_amount_due := (v_price_tiers->'rules'->>v_field_answer)::numeric;
      end if;
    end if;
  end if;

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

  if v_max_spots is not null then
    select count(*) into v_taken from public.registration_submissions rs
      where rs.form_id = p_form_id and rs.status in ('pending', 'approved');
    if v_taken >= v_max_spots then
      v_status := 'waitlisted';
    end if;
  end if;

  insert into public.registration_submissions (id, form_id, data, status, payment_choice, payment_status, amount_due, tryout_assignment_id)
  values (
    v_id, p_form_id, p_data, v_status, p_payment_choice,
    case when v_amount_due is not null then 'unpaid' else null end,
    v_amount_due, v_tryout_assignment_id
  );

  return query select v_id, v_status;
end;
$$;
