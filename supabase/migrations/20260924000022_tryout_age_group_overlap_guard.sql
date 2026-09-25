-- Stress-test finding #9 (Medium): tryout_fee_plans/tryout_offer_letter_templates
-- (a club's age_groups text[] "bands", added in 20260924000013) had a unique
-- index guaranteeing at most one '{}' (default) row per club, but nothing
-- stopped two NON-default rows from both listing the same age group (e.g.
-- one plan for ['U9','U10'] and another for ['U10','U11']) — resolveFeePlan()
-- would then resolve U10 to whichever row plansToMap() happened to iterate
-- last, nondeterministically, since the query had no ORDER BY. The
-- create-installments/send-offer/send-bulk-offers routes were updated
-- separately to add ORDER BY created_at as an interim determinism stopgap;
-- this closes the actual gap so overlapping bands can't be saved at all.

create or replace function public.check_tryout_fee_plans_no_overlap()
returns trigger language plpgsql as $$
begin
  if new.age_groups is null or array_length(new.age_groups, 1) is null then
    return new; -- '{}' default row — already governed by the one-default unique index
  end if;
  if exists (
    select 1 from public.tryout_fee_plans t
    where t.club_id = new.club_id and t.id <> new.id and t.age_groups && new.age_groups
  ) then
    raise exception 'One or more of these age groups already belong to another fee plan for this club.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tryout_fee_plans_no_overlap on public.tryout_fee_plans;
create trigger trg_tryout_fee_plans_no_overlap
  before insert or update on public.tryout_fee_plans
  for each row execute function public.check_tryout_fee_plans_no_overlap();

create or replace function public.check_tryout_offer_letter_templates_no_overlap()
returns trigger language plpgsql as $$
begin
  if new.age_groups is null or array_length(new.age_groups, 1) is null then
    return new;
  end if;
  if exists (
    select 1 from public.tryout_offer_letter_templates t
    where t.club_id = new.club_id and t.id <> new.id and t.age_groups && new.age_groups
  ) then
    raise exception 'One or more of these age groups already belong to another offer letter template for this club.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tryout_offer_letter_templates_no_overlap on public.tryout_offer_letter_templates;
create trigger trg_tryout_offer_letter_templates_no_overlap
  before insert or update on public.tryout_offer_letter_templates
  for each row execute function public.check_tryout_offer_letter_templates_no_overlap();
