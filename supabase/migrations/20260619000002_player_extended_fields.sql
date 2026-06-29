-- Extended player fields: DOB, secondary position, preferred foot, notes

alter table players
  add column if not exists date_of_birth   date,
  add column if not exists secondary_position text,
  add column if not exists preferred_foot  text check (preferred_foot in ('left','right','both')),
  add column if not exists notes           text;
