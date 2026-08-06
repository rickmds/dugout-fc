-- Add rule_type to field_availability_rules
-- 'block' = time when field is NOT available (groundskeeping, maintenance, etc.) — existing default
-- 'permit' = time when field IS permitted (from field booking permits)

alter table public.field_availability_rules
  add column if not exists rule_type text not null default 'block'
    check (rule_type in ('block', 'permit'));

-- Add date range columns for permit windows (permits have a season period)
alter table public.field_availability_rules
  add column if not exists valid_from  date null,
  add column if not exists valid_until date null;

-- Backfill existing rows as 'block'
update public.field_availability_rules set rule_type = 'block' where rule_type is null;
