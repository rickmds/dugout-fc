-- Payment plan installments were always spaced by a flat 30 (or 7) days
-- from the registration date, so a family registering on the 12th got
-- payments due the 12th, 11th, 12th of following months — never landing
-- on a predictable calendar day. Optional fixed due-day for monthly plans;
-- capped at 28 so it's always a valid day in every month, no Feb-29-style
-- edge cases to handle.
alter table public.registration_forms
  add column if not exists plan_day_of_month int check (plan_day_of_month between 1 and 28);
