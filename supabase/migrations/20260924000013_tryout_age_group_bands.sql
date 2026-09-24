-- Generalizes tryout_fee_plans and tryout_offer_letter_templates from
-- "one row per age group" to "one row per band of age groups" — a club
-- can now merge U9/U10/U11 into a single row instead of repeating the
-- same fee or letter three times. age_groups = '{}' still means the
-- Default (fallback) row; a non-empty array means that row applies to
-- every age group it lists. Identity moves from (club_id, age_group) to
-- the row's own id, since a row is no longer keyed by a single age group.

alter table public.tryout_fee_plans
  add column if not exists age_groups text[] not null default '{}';
update public.tryout_fee_plans
  set age_groups = array[age_group]
  where age_group <> '' and age_groups = '{}';
alter table public.tryout_fee_plans
  drop constraint if exists tryout_fee_plans_club_id_age_group_key;
alter table public.tryout_fee_plans
  drop column if exists age_group;
create unique index if not exists tryout_fee_plans_one_default
  on public.tryout_fee_plans (club_id) where age_groups = '{}';

alter table public.tryout_offer_letter_templates
  add column if not exists age_groups text[] not null default '{}';
update public.tryout_offer_letter_templates
  set age_groups = array[age_group]
  where age_group <> '' and age_groups = '{}';
alter table public.tryout_offer_letter_templates
  drop constraint if exists tryout_offer_letter_templates_club_id_age_group_key;
alter table public.tryout_offer_letter_templates
  drop column if exists age_group;
create unique index if not exists tryout_offer_letter_templates_one_default
  on public.tryout_offer_letter_templates (club_id) where age_groups = '{}';
