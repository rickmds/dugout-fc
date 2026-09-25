-- Stress-test finding #17 (Low): the public, unauthenticated tryout
-- process-response and registration POST endpoints had no abuse
-- protection at all, unlike send-reminder's existing 24-hour cooldown.
-- Generic, reusable sliding-window limiter — no Redis/external infra in
-- this codebase to reuse, and a plain table keyed by an arbitrary bucket
-- string (route + token, in practice) is simple enough not to need one.
-- See web/lib/rateLimit.ts.
create table public.rate_limit_hits (
  id         bigserial primary key,
  bucket     text not null,
  created_at timestamptz not null default now()
);

create index on public.rate_limit_hits (bucket, created_at);

alter table public.rate_limit_hits enable row level security;
-- Only ever touched via the service-role client (web/lib/rateLimit.ts) —
-- no policy grants any access under the anon/authenticated roles.
