-- Bulk "charge a fee to everyone who attended" — e.g. a tournament fee
-- applied to every rostered player marked present/late, instead of the
-- coach assigning it one player at a time. The caller supplies the exact
-- player list (built client-side from already-loaded roster + attendance
-- data, letting the coach review/deselect before confirming) rather than
-- this function re-deriving it from event_attendance itself.
--
-- SECURITY DEFINER + is_team_coach() rather than relying on player_fees'
-- own RLS policy directly — that policy still checks team_members/club
-- membership inline instead of the already-fixed is_team_coach() helper,
-- so a cross-club coach could hit the same gap fixed elsewhere today
-- (20260813000004/5). Routing through is_team_coach() here sidesteps it.

create or replace function public.assign_fee_to_attendees(
  p_team_id uuid,
  p_player_ids uuid[],
  p_description text,
  p_amount_due numeric,
  p_due_date date,
  p_category_id uuid default null
)
returns setof public.player_fees
language plpgsql security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_row public.player_fees%rowtype;
begin
  if not public.is_team_coach(p_team_id) then
    raise exception 'Not permitted';
  end if;
  if p_player_ids is null or array_length(p_player_ids, 1) is null then
    raise exception 'At least one player is required';
  end if;
  if p_amount_due is null or p_amount_due <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if coalesce(trim(p_description), '') = '' then
    raise exception 'Description is required';
  end if;

  foreach v_player_id in array p_player_ids loop
    -- Defense in depth: skip (don't error the whole batch on) any id that
    -- isn't actually on this team, rather than trusting the client array.
    if not exists (select 1 from public.players where id = v_player_id and team_id = p_team_id) then
      continue;
    end if;

    insert into public.player_fees (player_id, team_id, category_id, description, amount_due, due_date, status, created_by)
    values (v_player_id, p_team_id, p_category_id, trim(p_description), p_amount_due, p_due_date, 'outstanding', auth.uid())
    returning * into v_row;

    return next v_row;
  end loop;

  return;
end;
$$;

grant execute on function public.assign_fee_to_attendees(uuid, uuid[], text, numeric, date, uuid) to authenticated;
