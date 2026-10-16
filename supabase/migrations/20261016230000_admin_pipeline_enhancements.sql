-- Enhance admin authorization and assignment pipeline:

-- 2. Update private.is_admin to recognize:
--    - direct presence in private.admins (even if email_confirmed_at is not yet set)
--    - app_metadata role='admin' or is_admin=true
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and not coalesce(u.is_anonymous, false)
      and (
        exists (select 1 from private.admins a where a.user_id = auth.uid())
        or coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
        or coalesce((u.raw_app_meta_data ->> 'is_admin')::boolean, false)
      )
  );
$$;

-- 3. Update private.is_verified_user so any confirmed attendee OR any recognized admin is considered verified
create or replace function private.is_verified_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and not coalesce(u.is_anonymous, false)
      and (
        (u.email is not null and u.email_confirmed_at is not null)
        or private.is_admin()
      )
  );
$$;

-- 4. Trigger on private.admins to auto-confirm and stamp app_metadata when an admin is assigned by UID
create or replace function private.on_admin_assigned()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin", "is_admin": true}'::jsonb
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_admin_assigned on private.admins;
create trigger trg_admin_assigned
after insert on private.admins
for each row execute function private.on_admin_assigned();

-- 5. Backfill existing admins in private.admins
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin", "is_admin": true}'::jsonb
where id in (select user_id from private.admins);

-- 6. Helper function to allow existing admins or service_role to promote someone by UID
create or replace function public.add_admin(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User not found.' using errcode = '22023';
  end if;

  insert into private.admins(user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin", "is_admin": true}'::jsonb
  where id = target_user_id;

  return true;
end;
$$;

revoke all on function public.add_admin(uuid) from public, anon;
grant execute on function public.add_admin(uuid) to authenticated, service_role;
