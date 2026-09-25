-- PostgREST only exposes public-schema functions, so the edge functions
-- can't call vault.create_secret/update_secret/decrypted_secrets directly
-- via .rpc(). These SECURITY DEFINER wrappers are the only path in —
-- restricted to service_role, so even though they run with elevated
-- privileges, a regular authenticated client still can't call them and
-- can't decrypt a password on their own (or anyone else's) row.

create or replace function public.ncsa_save_credential(p_profile_id uuid, p_username text, p_password text)
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
  from public.ncsa_coach_credentials where profile_id = p_profile_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_password);
    update public.ncsa_coach_credentials
      set ncsa_username = p_username, verified_at = now(), updated_at = now()
      where profile_id = p_profile_id;
  else
    v_new_secret_id := vault.create_secret(p_password, 'ncsa_coach_' || p_profile_id::text);
    insert into public.ncsa_coach_credentials (profile_id, ncsa_username, ncsa_password_secret_id, verified_at)
    values (p_profile_id, p_username, v_new_secret_id, now());
  end if;
end;
$$;

revoke all on function public.ncsa_save_credential(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ncsa_save_credential(uuid, text, text) to service_role;

create or replace function public.ncsa_delete_credential(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  select ncsa_password_secret_id into v_secret_id
  from public.ncsa_coach_credentials where profile_id = p_profile_id;
  delete from public.ncsa_coach_credentials where profile_id = p_profile_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.ncsa_delete_credential(uuid) from public, anon, authenticated;
grant execute on function public.ncsa_delete_credential(uuid) to service_role;

create or replace function public.ncsa_get_credential(p_profile_id uuid)
returns table(ncsa_username text, ncsa_password text)
language sql
security definer
set search_path = public, vault
as $$
  select c.ncsa_username, s.decrypted_secret
  from public.ncsa_coach_credentials c
  join vault.decrypted_secrets s on s.id = c.ncsa_password_secret_id
  where c.profile_id = p_profile_id;
$$;

revoke all on function public.ncsa_get_credential(uuid) from public, anon, authenticated;
grant execute on function public.ncsa_get_credential(uuid) to service_role;
