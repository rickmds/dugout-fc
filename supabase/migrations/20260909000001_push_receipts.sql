-- send-push fires a push and walks away — Expo's immediate response is only
-- a "ticket" (it accepted the request), not proof of actual delivery to
-- Apple/Google. Whether it really landed only shows up in a SEPARATE
-- receipts lookup, minutes later, keyed by the ticket id — and until now
-- nothing persisted those ticket ids anywhere, so there was no way to ever
-- ask "did that send actually work" after the fact. This table is what
-- check-push-receipts (a new cron) reads from and writes back to.

create table public.push_receipts (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  profile_id uuid references public.profiles(id) on delete set null,
  token text not null,
  team_id uuid references public.teams(id) on delete set null,
  notification_type text,
  title text,
  body text,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

-- The cron's own lookup ("give me everything still pending") — this is the
-- only query pattern this table needs to serve fast.
create index push_receipts_pending_idx on public.push_receipts(created_at) where status = 'pending';

alter table public.push_receipts enable row level security;

-- Written only by the send-push edge function and the receipts cron (both
-- service role, bypasses RLS) — no authenticated user ever needs to read
-- or write this directly, it's purely operational/diagnostic.
