-- Team-delete (web/app/(dashboard)/dashboard/teams/page.tsx) and
-- player-delete (roster page, mobile player detail) are raw single-statement
-- deletes with no cascade-gap protection — the exact same class of bug
-- admin_delete_club had, confirmed live: `delete from teams` hits
-- evaluation_batches_team_id_fkey, `delete from players` hits
-- player_evaluations_player_id_fkey. Both are dormant today (zero rows in
-- the affected tables club-wide) but will break the moment a coach uses
-- match tracker or evaluations.
--
-- Generalizing the self-healing engine built for admin_delete_club (see
-- 20260824030000) to take an arbitrary anchor table instead of always
-- assuming 'clubs', so team/player deletes get the same protection without
-- duplicating the engine. _club_scope_subquery's "prefer a column literally
-- named club_id" heuristic is replaced with a real FK lookup (does any
-- column have a foreign key straight to the anchor table, whatever it's
-- named) — more general, and behaves identically for the existing
-- admin_delete_club callers since those tables' club_id columns really are
-- FK'd to clubs.
create or replace function public._scope_subquery(p_table regclass, p_anchor_table regclass) returns text
language plpgsql as $$
declare
  direct_col text;
  parent_tbl regclass;
  parent_col text;
begin
  if p_table = p_anchor_table then
    return '(select $1::uuid)';
  end if;

  select a.attname into direct_col
  from pg_constraint con
  join unnest(con.conkey) as k(attnum) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.conrelid = p_table and con.contype = 'f' and con.confrelid = p_anchor_table
  limit 1;

  if direct_col is not null then
    return format('(select id from %s where %I = $1)', p_table, direct_col);
  end if;

  select con.confrelid, a.attname
    into parent_tbl, parent_col
  from pg_constraint con
  join unnest(con.conkey) as k(attnum) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.conrelid = p_table and con.contype = 'f' and con.confdeltype = 'c'
  order by case when con.confrelid = p_anchor_table then 0 else 1 end
  limit 1;

  if parent_tbl is null then
    raise exception '_scope_subquery: no cascade path from % back to %', p_table, p_anchor_table;
  end if;

  return format('(select id from %s where %I in %s)', p_table, parent_col, public._scope_subquery(parent_tbl, p_anchor_table));
end;
$$;

create or replace function public._delete_resolving_fk(p_sql text, p_anchor_id uuid, p_anchor_table regclass, p_depth int default 0) returns void
language plpgsql as $$
declare
  cname text;
  child_tbl regclass;
  child_col text;
  parent_tbl regclass;
begin
  if p_depth > 20 then
    raise exception 'delete_resolving_fk: foreign key resolution too deep (possible cycle) at: %', p_sql;
  end if;

  begin
    execute p_sql using p_anchor_id;
  exception when foreign_key_violation then
    get stacked diagnostics cname = CONSTRAINT_NAME;

    select con.conrelid, a.attname, con.confrelid
      into child_tbl, child_col, parent_tbl
    from pg_constraint con
    join unnest(con.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    where con.conname = cname
    limit 1;

    if child_tbl is null then
      raise;
    end if;

    perform public._delete_resolving_fk(
      format('delete from %s where %I in %s', child_tbl, child_col, public._scope_subquery(parent_tbl, p_anchor_table)),
      p_anchor_id, p_anchor_table, p_depth + 1
    );

    perform public._delete_resolving_fk(p_sql, p_anchor_id, p_anchor_table, p_depth + 1);
  end;
end;
$$;

create or replace function public.admin_delete_club(p_club_id uuid)
returns void
language plpgsql
as $$
begin
  perform public._delete_resolving_fk('delete from clubs where id = $1', p_club_id, 'clubs'::regclass);
end;
$$;

create or replace function public.admin_delete_team(p_team_id uuid)
returns void
language plpgsql
as $$
begin
  perform public._delete_resolving_fk('delete from teams where id = $1', p_team_id, 'teams'::regclass);
end;
$$;

create or replace function public.admin_delete_player(p_player_id uuid)
returns void
language plpgsql
as $$
begin
  perform public._delete_resolving_fk('delete from players where id = $1', p_player_id, 'players'::regclass);
end;
$$;

-- _club_scope_subquery is superseded by the general _scope_subquery above.
drop function if exists public._club_scope_subquery(regclass);
