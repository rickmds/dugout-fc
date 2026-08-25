-- Same bug class as 20260816000001 (profiles_select_own) and
-- 20260812000002 (is_team_coach): a bare `current_user_role() in
-- ('org_admin','app_admin')` with no club/team check, found by auditing
-- every live policy and function that references current_user_role()
-- directly. app_admin (platform owner) is meant to be global — org_admin
-- is not, and never was per CLAUDE.md's access-level table, but these three
-- spots let ANY org_admin on the platform act on ANY other club's data.

-- 1. conversation_participants DELETE — an org_admin at any club could
-- remove any participant from any conversation at any other club. Bring it
-- in line with conv_participants_select on the same table, which already
-- scopes its org_admin branch via is_club_conversation().
drop policy if exists "conv_participants_delete" on public.conversation_participants;

create policy "conv_participants_delete" on public.conversation_participants for delete
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      join public.teams t on t.id = c.team_id
      where c.id = conversation_participants.conversation_id
        and public.is_team_coach(t.id)
    )
    or public.current_user_role() = 'app_admin'
    or (public.current_user_role() = 'org_admin' and public.is_club_conversation(conversation_id))
  );

-- 2. player_match_periods SELECT — is_team_member(team_id) already grants
-- org_admin access scoped to their own club (and app_admin globally), so
-- the extra `or current_user_role() = any(...)` was both redundant and an
-- unscoped cross-club leak. Just drop it.
drop policy if exists "team members read periods" on public.player_match_periods;

create policy "team members read periods" on public.player_match_periods for select
  using (public.is_team_member(team_id));

-- 3. confirm_fee_payment / decline_fee_claim — same redundant-and-unscoped
-- pattern: is_team_coach(v_row.team_id) already covers org_admin (own club)
-- and app_admin (global), so the `or current_user_role() in (...)` let any
-- org_admin confirm/decline fee claims on any other club's players.
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
  v_new_paid numeric;
  v_new_status text;
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
$function$;

create or replace function public.decline_fee_claim(p_fee_id uuid)
 returns player_fees
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.player_fees%rowtype;
begin
  select * into v_row from public.player_fees where id = p_fee_id;
  if not found then
    raise exception 'Fee not found';
  end if;
  if not public.is_team_coach(v_row.team_id) then
    raise exception 'Not permitted';
  end if;

  update public.player_fees
  set claim_status = 'none', claim_amount = null, claim_method = null, claim_note = null, claimed_by = null, claimed_at = null
  where id = p_fee_id
  returning * into v_row;

  return v_row;
end;
$function$;
