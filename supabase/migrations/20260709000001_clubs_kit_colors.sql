alter table clubs
  add column if not exists home_kit_color text,
  add column if not exists away_kit_color text;
