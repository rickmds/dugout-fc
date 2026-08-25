-- clubs.currency exists but is a free-standing dropdown with nothing behind
-- it — Stripe Connect accounts are created with no country at all (Stripe
-- silently defaults them to the platform account's own country), and the
-- PaymentIntent that actually charges a parent's card is hardcoded to
-- 'usd' regardless of this column. A UK/Canadian club could set currency
-- to GBP/CAD and see the right symbol on screen while every real charge
-- still moved in USD through a US-flavored Connect account.
--
-- country becomes the source of truth; currency is derived from it (see
-- lib/countries.ts on the app side) rather than picked independently.
alter table public.clubs
  add column country text not null default 'US';

alter table public.clubs
  add constraint clubs_country_check
  check (country = any (array['US','GB','CA','AU','IE']));

-- Existing clubs (MDS Academy, Maroons SC) are US-based; currency was
-- already defaulting to USD for them, so this just makes country agree.
update public.clubs set country = 'US' where country is distinct from 'US';
