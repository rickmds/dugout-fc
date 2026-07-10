-- Add website and contact_email fields to clubs table
alter table public.clubs
  add column if not exists website      text,
  add column if not exists contact_email text;
