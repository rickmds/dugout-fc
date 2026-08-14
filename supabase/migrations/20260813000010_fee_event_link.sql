-- Link a fee back to the event it was charged for (e.g. a tournament gate
-- fee assigned via "Charge attendees"), so it can be shown alongside the
-- fee without hunting through the description text. Nullable — most fees
-- (registration, uniforms) aren't tied to a single event.
alter table public.player_fees
  add column if not exists event_id uuid references public.events(id) on delete set null;

create or replace function public.assign_fee_to_attendees(
  p_team_id uuid,
  p_player_ids uuid[],
  p_description text,
  p_amount_due numeric,
  p_due_date date,
  p_category_id uuid default null,
  p_payee_type text default 'club',
  p_payment_instructions text default null,
  p_event_id uuid default null
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
  if p_payee_type not in ('club', 'coach') then
    raise exception 'Invalid payee_type';
  end if;

  foreach v_player_id in array p_player_ids loop
    -- Defense in depth: skip (don't error the whole batch on) any id that
    -- isn't actually on this team, rather than trusting the client array.
    if not exists (select 1 from public.players where id = v_player_id and team_id = p_team_id) then
      continue;
    end if;

    insert into public.player_fees (
      player_id, team_id, category_id, description, amount_due, due_date,
      status, created_by, payee_type, payment_instructions, event_id
    )
    values (
      v_player_id, p_team_id, p_category_id, trim(p_description), p_amount_due, p_due_date,
      'outstanding', auth.uid(), p_payee_type,
      case when p_payee_type = 'coach' then p_payment_instructions else null end,
      p_event_id
    )
    returning * into v_row;

    return next v_row;
  end loop;

  return;
end;
$$;

grant execute on function public.assign_fee_to_attendees(uuid, uuid[], text, numeric, date, uuid, text, text, uuid) to authenticated;
