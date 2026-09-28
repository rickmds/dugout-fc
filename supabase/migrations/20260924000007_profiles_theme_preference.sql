alter table public.profiles
  add column if not exists theme_preference text not null default 'dark'
    check (theme_preference in ('dark', 'light'));
