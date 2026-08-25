-- Pre-scale data-model audit finding: bulk-waitlisting selected
-- registration submissions issued one UPDATE per row (to assign sequential
-- waitlist positions) instead of a single batched statement — common
-- during registration season right when a form fills up and an admin
-- clears an overflow batch. Not security definer: it runs as the calling
-- user, so it relies on (and stays consistent with) the same
-- registration_submissions RLS UPDATE policy the direct client-side
-- `.update()` call it replaces already depended on.
create or replace function public.bulk_set_waitlist_positions(p_ids uuid[], p_start_pos int)
returns void
language sql
as $$
  update public.registration_submissions rs
  set status = 'waitlisted', waitlist_position = p_start_pos + (u.idx - 1)::int
  from unnest(p_ids) with ordinality as u(id, idx)
  where rs.id = u.id;
$$;

grant execute on function public.bulk_set_waitlist_positions(uuid[], int) to authenticated;
