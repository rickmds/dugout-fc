-- Add emergency contact fields to invites so coaches can store
-- guardian name, phone, and relationship for each linked parent.

alter table invites
  add column if not exists guardian_name  text,
  add column if not exists phone          text,
  add column if not exists relationship   text;
