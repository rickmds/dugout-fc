-- Pre-scale data-model audit finding: player_fees.amount_paid is written
-- by four independent paths; only the Stripe webhook protects against
-- concurrent writes (a compare-and-swap retry loop). confirm_fee_payment
-- read v_row.amount_paid once at the top of the function and used that
-- stale value to compute v_new_paid, then wrote it back with a plain
-- `where id = p_fee_id` — a parent's Stripe payment landing via webhook at
-- the same moment a coach confirms a cash claim on the same fee could
-- silently drop one of the two contributions. A single UPDATE with an
-- arithmetic SET expression (amount_paid = amount_paid + v_amount) is
-- atomic under Postgres row locking, so no separate CAS retry loop is
-- needed here the way the application-layer TypeScript call sites needed
-- one — the fix is just not reading a stale copy of the value first.
create or replace function public.confirm_fee_payment(p_fee_id uuid, p_amount numeric DEFAULT NULL::numeric, p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 returns player_fees
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.player_fees%rowtype;
  v_amount numeric;
  v_method text;
begin
  select * into v_row from public.player_fees where id = p_fee_id;
  if not found then
    raise exception 'Fee not found';
  end if;
  if not public.is_team_coach(v_row.team_id) then
    raise exception 'Not permitted';
  end if;

  v_amount := coalesce(p_amount, v_row.claim_amount);
  v_method := coalesce(p_method, v_row.claim_method, 'venmo');
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.fee_payments (player_fee_id, amount, method, reference, notes, recorded_by)
  values (p_fee_id, v_amount, v_method, p_reference, 'Confirmed from parent claim', auth.uid());

  update public.player_fees
  set amount_paid = amount_paid + v_amount,
      status = case
        when (amount_paid + v_amount) <= 0 then 'outstanding'
        when (amount_paid + v_amount) >= (amount_due - discount - 0.01) then 'paid'
        else 'partial'
      end,
      claim_status = 'none', claim_amount = null, claim_method = null, claim_note = null, claimed_by = null, claimed_at = null
  where id = p_fee_id
  returning * into v_row;

  return v_row;
end;
$function$;
