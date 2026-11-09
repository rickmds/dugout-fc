-- "Mark as Not Good" counterpart to the existing approve flow: an admin
-- sends a submitted evaluation back to the coach with a short note on what
-- needs fixing. The eval reverts to 'draft' (same queue it started in);
-- admin_feedback holds the note until the coach resubmits, at which point
-- it's cleared (see enter/page.tsx's saveOne).
alter table player_evaluations
  add column if not exists admin_feedback text;
