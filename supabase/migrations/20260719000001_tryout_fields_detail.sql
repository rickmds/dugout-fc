-- Extend tryout_fields with full detail columns
alter table public.tryout_fields
  add column if not exists address               text,
  add column if not exists surface               text,
  add column if not exists has_lights            boolean default false,
  add column if not exists field_size            text,
  add column if not exists dimensions            text,
  add column if not exists facilities            text[] default '{}',
  add column if not exists rental_cost_per_hour  numeric(10,2),
  add column if not exists facility_contact_name text,
  add column if not exists facility_contact_phone text,
  add column if not exists field_notes           text,
  add column if not exists is_closed             boolean default false;

-- Add slot_id to tryout_expenses so auto-created rental expenses
-- cascade-delete when the slot is removed
alter table public.tryout_expenses
  add column if not exists slot_id uuid references public.tryout_practice_slots(id) on delete cascade;
