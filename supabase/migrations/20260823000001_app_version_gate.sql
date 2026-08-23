-- Single-row config the app checks on launch to decide whether to show a
-- hard "update required" block. Deliberately NOT tied to app.json's version
-- bumping with every release — this stays untouched by default, so every
-- ship is optional. It only enforces anything once someone explicitly
-- raises min_ios_version/min_android_version past the currently-installed
-- version, which is a manual decision for whichever release actually needs
-- to be mandatory (no client-facing write path — updated directly via SQL).
create table if not exists app_version_gate (
  id int primary key default 1 check (id = 1),
  min_ios_version text not null default '0.0.0',
  min_android_version text not null default '0.0.0',
  updated_at timestamptz default now()
);

insert into app_version_gate (id) values (1) on conflict (id) do nothing;

alter table app_version_gate enable row level security;

create policy "Anyone can read the version gate"
  on app_version_gate for select
  using (true);
