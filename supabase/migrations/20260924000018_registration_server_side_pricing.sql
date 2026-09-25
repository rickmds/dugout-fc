-- Stress-test finding (Critical #1): submit_registration inserted
-- p_amount_due verbatim with zero validation against the form's own
-- price/price_mode/price_tiers config — a client (or anyone calling the
-- RPC directly with the anon key) could submit any amount_due it liked,
-- including $0 on a paid form, or a price from a different tier/rule.
--
-- This resolves the amount due entirely server-side from
-- registration_forms.price/price_mode/price_tiers, the same three modes
-- already implemented client-side in web/app/register/[token]/page.tsx:
--   - 'flat'  -> registration_forms.price
--   - 'tiers' -> price_tiers is a PriceTier[] ({label, price}); the client
--                now also sends which tier was selected via
--                p_data->>'__selected_tier', and the server looks up that
--                tier's price itself rather than trusting a client-sent
--                number
--   - 'field' -> price_tiers is {field, rules}; the answer to `field` is
--                already a real, already-validated form answer sitting in
--                p_data, so no client change was needed for this branch
--
-- p_amount_due is kept as a parameter for call-site compatibility but is
-- no longer trusted for the actual insert.
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
  v_price_mode text;
  v_price numeric;
  v_price_tiers jsonb;
  v_amount_due numeric;
  v_selected_tier text;
  v_field_answer text;
begin
  select rf.max_spots, rf.price, rf.price_mode, rf.price_tiers
    into v_max_spots, v_price, v_price_mode, v_price_tiers
  from public.registration_forms rf
  where rf.id = p_form_id and rf.status = 'open';

  if not found then
    raise exception 'This form is not open for submissions';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_form_id::text));

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

  insert into public.registration_submissions (id, form_id, data, status, payment_choice, payment_status, amount_due)
  values (
    v_id, p_form_id, p_data, v_status, p_payment_choice,
    case when v_amount_due is not null then 'unpaid' else null end,
    v_amount_due
  );

  return query select v_id, v_status;
end;
$$;
