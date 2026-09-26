-- Same rationale as ncsa_coach_credentials_vault_fns
-- (20260924000009): PostgREST only exposes public-schema functions, so
-- edge functions can't call vault.create_secret/update_secret/
-- decrypted_secrets directly via .rpc(). These SECURITY DEFINER wrappers
-- are the only path in — restricted to service_role, so even though they
-- run with elevated privileges, a regular authenticated client still
-- can't call them and can't decrypt a club's admin password on its own.

create or replace function public.ncsa_save_club_credential(p_club_id uuid, p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_secret_id uuid;
  v_new_secret_id uuid;
begin
  select ncsa_password_secret_id into v_existing_secret_id
  from public.club_ncsa_admin_credentials where club_id = p_club_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_password);
    update public.club_ncsa_admin_credentials
      set ncsa_username = p_username, verified_at = now(), updated_at = now()
      where club_id = p_club_id;
  else
    v_new_secret_id := vault.create_secret(p_password, 'ncsa_club_' || p_club_id::text);
    insert into public.club_ncsa_admin_credentials (club_id, ncsa_username, ncsa_password_secret_id, verified_at)
    values (p_club_id, p_username, v_new_secret_id, now());
  end if;
end;
$$;

revoke all on function public.ncsa_save_club_credential(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ncsa_save_club_credential(uuid, text, text) to service_role;

create or replace function public.ncsa_delete_club_credential(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  select ncsa_password_secret_id into v_secret_id
  from public.club_ncsa_admin_credentials where club_id = p_club_id;
  delete from public.club_ncsa_admin_credentials where club_id = p_club_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.ncsa_delete_club_credential(uuid) from public, anon, authenticated;
grant execute on function public.ncsa_delete_club_credential(uuid) to service_role;

create or replace function public.ncsa_get_club_credential(p_club_id uuid)
returns table(ncsa_username text, ncsa_password text)
language sql
security definer
set search_path = public, vault
as $$
  select c.ncsa_username, s.decrypted_secret
  from public.club_ncsa_admin_credentials c
  join vault.decrypted_secrets s on s.id = c.ncsa_password_secret_id
  where c.club_id = p_club_id;
$$;

revoke all on function public.ncsa_get_club_credential(uuid) from public, anon, authenticated;
grant execute on function public.ncsa_get_club_credential(uuid) to service_role;
