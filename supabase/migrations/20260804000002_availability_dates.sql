-- Add rule_date column for date-specific availability (replaces day_of_week pattern approach)
alter table public.field_availability_rules
  add column if not exists rule_date date null;

-- Make day_of_week nullable (kept for any future recurring-pattern use)
alter table public.field_availability_rules
  alter column day_of_week drop not null;

-- Clean up all existing rules (they were stored incorrectly during dev/debug)
delete from public.field_availability_rules;

-- Also drop the auto-created "Orchard ES - Orchard Field" field from tryout_fields
-- (it will be recreated correctly when permits are re-imported)
-- We leave tryout_fields untouched so MDS Home stays.
