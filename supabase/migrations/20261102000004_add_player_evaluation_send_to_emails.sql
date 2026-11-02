-- Lets a coach explicitly choose which on-file guardian email(s) an
-- evaluation should actually go to, rather than defaulting to "every
-- email we have on file." Guards against an address that doesn't really
-- belong to the family (see players.guardian_emails' own sourcing
-- caveats — it comes from a club roster export, not a verified source)
-- ever being used as a send target without a human who knows the family
-- confirming it first.
alter table player_evaluations
  add column if not exists send_to_emails text[] not null default '{}';
