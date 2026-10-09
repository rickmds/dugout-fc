-- Ordered, per-team waitlist: lets staff line candidates up for a specific
-- team (not just the generic Unassigned pool), so that when a roster spot
-- frees up (an accepted/offered player declines), the system knows exactly
-- who's next for THAT team and can auto-offer them.
alter table public.tryout_assignments
  add column if not exists waitlist_position integer;

-- Staff notification preferences for the offer-response lifecycle. Accepts
-- are high-volume and not actionable day-to-day; declines are rare and mean
-- a roster spot just opened, so the defaults differ.
alter table public.tryout_offer_settings
  add column if not exists notify_staff_on_accept boolean not null default false,
  add column if not exists notify_staff_on_decline boolean not null default true;
