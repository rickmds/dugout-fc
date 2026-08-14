-- Parent self-report ("I've paid") for coach-collected fees. The claim
-- doesn't move money or flip status by itself — it just flags the fee
-- as awaiting the coach's confirmation, so a tap can't silently wipe a
-- balance. Confirming reuses the exact same fee_payments/player_fees
-- write recordFeePayment() already does on web, just callable from
-- mobile so the coach never has to open the web dashboard.

alter table public.player_fees
  add column if not exists claim_status text not null default 'none' check (claim_status in ('none', 'pending')),
  add column if not exists claim_amount numeric,
  add column if not exists claim_method text,
  add column if not exists claim_note text,
  add column if not exists claimed_by uuid references public.profiles(id),
  add column if not exists claimed_at timestamptz;

-- Parent claims they've paid a coach-collected fee directly (Venmo/cash/etc).
create or replace function public.claim_fee_payment(
  p_fee_id uuid,
  p_amount numeric,
  p_method text,
  p_note text default null
)
returns public.player_fees
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.player_fees%rowtype;
begin
  select * into v_row from public.player_fees where id = p_fee_id;
  if not found then
    raise exception 'Fee not found';
  end if;
  if not exists (select 1 from public.players where id = v_row.player_id and profile_id = auth.uid()) then
    raise exception 'Not permitted';
  end if;
  if v_row.payee_type <> 'coach' then
    raise exception 'This fee is not coach-collected';
  end if;
  if v_row.status in ('paid', 'waived') then
    raise exception 'This fee is already settled';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  update public.player_fees
  set claim_status = 'pending', claim_amount = p_amount, claim_method = p_method,
      claim_note = p_note, claimed_by = auth.uid(), claimed_at = now()
  where id = p_fee_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.claim_fee_payment(uuid, numeric, text, text) to authenticated;

-- Coach confirms a parent's claim — records the payment exactly like a
-- manual entry on web would (same insert + status math as
-- recordFeePayment() in web/lib/feePayments.ts), then clears the claim.
create or replace function public.confirm_fee_payment(
  p_fee_id uuid,
  p_amount numeric default null,
  p_method text default null,
  p_reference text default null
)
returns public.player_fees
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.player_fees%rowtype;
  v_amount numeric;
  v_method text;
  v_new_paid numeric;
  v_new_status text;
begin
  select * into v_row from public.player_fees where id = p_fee_id;
  if not found then
    raise exception 'Fee not found';
  end if;
  if not (public.is_team_coach(v_row.team_id) or public.current_user_role() in ('org_admin', 'app_admin')) then
    raise exception 'Not permitted';
  end if;

  v_amount := coalesce(p_amount, v_row.claim_amount);
  v_method := coalesce(p_method, v_row.claim_method, 'venmo');
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.fee_payments (player_fee_id, amount, method, reference, notes, recorded_by)
  values (p_fee_id, v_amount, v_method, p_reference, 'Confirmed from parent claim', auth.uid());

  v_new_paid := v_row.amount_paid + v_amount;
  v_new_status := case
    when v_new_paid <= 0 then 'outstanding'
    when v_new_paid >= (v_row.amount_due - v_row.discount - 0.01) then 'paid'
    else 'partial'
  end;

  update public.player_fees
  set amount_paid = v_new_paid, status = v_new_status,
      claim_status = 'none', claim_amount = null, claim_method = null, claim_note = null, claimed_by = null, claimed_at = null
  where id = p_fee_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.confirm_fee_payment(uuid, numeric, text, text) to authenticated;

-- Coach declines a parent's claim — clears it without recording any payment.
create or replace function public.decline_fee_claim(p_fee_id uuid)
returns public.player_fees
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.player_fees%rowtype;
begin
  select * into v_row from public.player_fees where id = p_fee_id;
  if not found then
    raise exception 'Fee not found';
  end if;
  if not (public.is_team_coach(v_row.team_id) or public.current_user_role() in ('org_admin', 'app_admin')) then
    raise exception 'Not permitted';
  end if;

  update public.player_fees
  set claim_status = 'none', claim_amount = null, claim_method = null, claim_note = null, claimed_by = null, claimed_at = null
  where id = p_fee_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.decline_fee_claim(uuid) to authenticated;
