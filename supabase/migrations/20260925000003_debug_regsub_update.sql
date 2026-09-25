create or replace function public.__debug_try_update_as_org_admin(p_submission_id uuid, p_profile_id uuid)
returns text
language plpgsql as $$
declare
  rc int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_profile_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.registration_submissions
  set payment_status = 'partial'
  where id = p_submission_id;
  get diagnostics rc = row_count;

  return 'rows updated: ' || rc::text;
exception when others then
  return 'ERROR: ' || SQLSTATE || ' - ' || SQLERRM;
end;
$$;
grant execute on function public.__debug_try_update_as_org_admin(uuid, uuid) to service_role;
