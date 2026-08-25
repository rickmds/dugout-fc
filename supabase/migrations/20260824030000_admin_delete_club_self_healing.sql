-- The dynamic version of admin_delete_club (20260824020000) only found
-- tables with a NO ACTION/RESTRICT FK pointing STRAIGHT at clubs(id). A real
-- delete attempt just failed on player_match_periods.team_id -> teams(id),
-- which is one hop further out and invisible to that check: the table
-- already has three OTHER cascading FKs (event_id, game_session_id,
-- player_id), so it "looks reachable" even though rows with only team_id
-- set (no event/session/player yet) are never actually removed by any of
-- those cascades.
--
-- Rather than keep extending a static check for every possible hop depth,
-- make the function self-healing: attempt the delete, and on a foreign key
-- violation, use Postgres's own exception diagnostics to identify exactly
-- which table/column blocked it, delete just those rows (scoped correctly
-- to this club — see _club_scope_subquery below), and retry. Recursive, so
-- a patch delete that itself hits a blocker resolves that first. This
-- self-heals for any future table added without ON DELETE CASCADE, at any
-- depth, without needing this function touched again.

-- Given a table reachable from clubs, returns a SQL subquery selecting the
-- ids of that table's rows belonging to club $1 — as literal text
-- containing a `$1` placeholder, for the caller to EXECUTE ... USING p_club_id.
-- Prefers a direct club_id column when the table has one (cheap and correct
-- even if the table also has an unrelated cascade edge); otherwise walks
-- one ON DELETE CASCADE edge back toward clubs and recurses.
create or replace function _club_scope_subquery(p_table regclass) returns text
language plpgsql as $$
declare
  direct_col text;
  parent_tbl regclass;
  parent_col text;
begin
  if p_table = 'clubs'::regclass then
    return '(select $1::uuid)';
  end if;

  select a.attname into direct_col
  from pg_attribute a
  where a.attrelid = p_table and a.attname = 'club_id' and not a.attisdropped;

  if direct_col is not null then
    return format('(select id from %s where %I = $1)', p_table, direct_col);
  end if;

  select con.confrelid, a.attname
    into parent_tbl, parent_col
  from pg_constraint con
  join unnest(con.conkey) as k(attnum) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.conrelid = p_table and con.contype = 'f' and con.confdeltype = 'c'
  limit 1;

  if parent_tbl is null then
    raise exception '_club_scope_subquery: no club_id column and no cascade path back to clubs for table %', p_table;
  end if;

  return format('(select id from %s where %I in %s)', p_table, parent_col, _club_scope_subquery(parent_tbl));
end;
$$;

-- Executes p_sql (a DELETE statement using p_club_id as its one parameter);
-- on a foreign_key_violation, resolves the specific blocking table via
-- pg_constraint + _club_scope_subquery, deletes those rows, then retries
-- p_sql. p_depth guards against an unresolvable cycle.
create or replace function _delete_resolving_fk(p_sql text, p_club_id uuid, p_depth int default 0) returns void
language plpgsql as $$
declare
  cname text;
  child_tbl regclass;
  child_col text;
  parent_tbl regclass;
begin
  if p_depth > 20 then
    raise exception 'admin_delete_club: foreign key resolution too deep (possible cycle) at: %', p_sql;
  end if;

  begin
    execute p_sql using p_club_id;
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

    perform _delete_resolving_fk(
      format('delete from %s where %I in %s', child_tbl, child_col, _club_scope_subquery(parent_tbl)),
      p_club_id, p_depth + 1
    );

    perform _delete_resolving_fk(p_sql, p_club_id, p_depth + 1);
  end;
end;
$$;

create or replace function admin_delete_club(p_club_id uuid)
returns void
language plpgsql
as $$
begin
  perform _delete_resolving_fk('delete from clubs where id = $1', p_club_id);
end;
$$;
