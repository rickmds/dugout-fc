-- Web Push subscriptions for the PWA (Android bridge). Parallel to
-- push_tokens, but a browser subscription is {endpoint, keys} rather
-- than a single opaque token, so it needs its own shape.
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique(profile_id, endpoint)
);

alter table public.web_push_subscriptions enable row level security;

create policy "web_push_subscriptions_own" on public.web_push_subscriptions for all
  using (profile_id = auth.uid());
