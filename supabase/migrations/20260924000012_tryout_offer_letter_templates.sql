-- Per-age-group (or club-wide default) offer letter — subject, from name,
-- and body can each independently be overridden per age group, falling
-- back to the '' (default) row's value, mirroring tryout_fee_plans.
create table public.tryout_offer_letter_templates (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references public.clubs(id) on delete cascade not null,
  age_group  text not null default '',
  subject    text,
  from_name  text,
  body_html  text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (club_id, age_group)
);

alter table public.tryout_offer_letter_templates enable row level security;

create policy "club staff select tryout_offer_letter_templates"
  on public.tryout_offer_letter_templates for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_offer_letter_templates"
  on public.tryout_offer_letter_templates for all
  using (public.is_club_admin(club_id));

create trigger trg_tryout_offer_letter_templates_updated_at
  before update on public.tryout_offer_letter_templates
  for each row execute function public.set_updated_at();

create index on public.tryout_offer_letter_templates (club_id);

-- Backfill from the old single-U8-toggle fields so no club's existing
-- letter content is lost by this generalization.
insert into public.tryout_offer_letter_templates (club_id, age_group, subject, from_name, body_html)
select club_id, '', email_subject, from_name, email_body_html
from public.tryout_offer_settings
where coalesce(email_body_html, '') <> '' or coalesce(email_subject, '') <> ''
on conflict (club_id, age_group) do nothing;

insert into public.tryout_offer_letter_templates (club_id, age_group, body_html)
select club_id, 'U8', email_body_html_u8
from public.tryout_offer_settings
where coalesce(email_body_html_u8, '') <> ''
on conflict (club_id, age_group) do nothing;
