-- 1. Add reviewed_by UUID tracking to reservations (UUID only, no email columns)
alter table public.reservations add column if not exists reviewed_by uuid references auth.users(id);

-- If reviewed_by_email or admin_email was previously added, drop them cleanly
alter table public.reservations drop column if exists reviewed_by_email;
alter table public.review_history drop column if exists admin_email;

-- 3. Update private.review_reservation to record reviewed_by (UUID only)
create or replace function private.review_reservation(p_reservation_id uuid, p_decision text, p_receipt_path text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_review_id uuid;
  v_notification_id uuid;
  v_event public.event_settings;
  v_note text := nullif(trim(p_note), '');
begin
  if not private.is_admin() then raise exception 'Admin access required.' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.' using errcode = '22023';
  end if;
  if length(v_note) > 1000 or (p_decision = 'rejected' and v_note is null) then
    raise exception 'A rejection needs a reason of up to 1,000 characters.' using errcode = '22023';
  end if;
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.' using errcode = '22023'; end if;
  if v_reservation.status <> 'pending_review' then
    raise exception 'This reservation has already been reviewed or has no receipt.' using errcode = '22023';
  end if;
  if p_receipt_path is distinct from v_reservation.receipt_path then
    raise exception 'The receipt changed. Refresh before reviewing.' using errcode = '22023';
  end if;

  update public.reservations
  set status = p_decision,
      review_note = v_note,
      reviewed_at = now(),
      updated_at = now(),
      reviewed_by = auth.uid()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.review_history(reservation_id, admin_id, decision, note, receipt_path)
  values (p_reservation_id, auth.uid(), p_decision, v_note, v_reservation.receipt_path)
  returning id into v_review_id;

  select * into strict v_event from public.event_settings where id = v_reservation.event_id;
  insert into public.notification_outbox(reservation_id, review_id, recipient_email, payload)
  values (p_reservation_id, v_review_id, v_reservation.email, jsonb_build_object(
    'event_name', v_event.name, 'reference', v_reservation.reference,
    'full_name', v_reservation.full_name, 'status', p_decision, 'review_note', v_note,
    'amount_lkr', v_reservation.amount_lkr,
    'starts_at', v_event.starts_at, 'venue', v_event.venue
  )) returning id into v_notification_id;

  return jsonb_build_object('reservation', to_jsonb(v_reservation), 'notification_id', v_notification_id);
end;
$$;

-- 4. Backfill existing reservations reviewed_by from review_history
update public.reservations r
set reviewed_by = h.admin_id
from (
  select distinct on (reservation_id) reservation_id, admin_id
  from public.review_history
  order by reservation_id, created_at desc
) h
where r.id = h.reservation_id and r.reviewed_by is null;

-- 5. Secure function for admins to get directory of all admins matching the query
drop function if exists public.get_admins();

create or replace function public.get_admins()
returns table (
  user_id uuid,
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  role text,
  in_private_admins boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return query
  select
    u.id as user_id,
    u.id as id,
    u.email::text,
    u.email_confirmed_at,
    coalesce(u.raw_app_meta_data ->> 'role', 'admin')::text as role,
    exists (select 1 from private.admins a where a.user_id = u.id) as in_private_admins,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  where not coalesce(u.is_anonymous, false)
    and (
      exists (select 1 from private.admins a where a.user_id = u.id)
      or coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
      or coalesce((u.raw_app_meta_data ->> 'is_admin')::boolean, false)
    )
  order by u.created_at asc;
end;
$$;

revoke all on function public.get_admins() from public, anon;
grant execute on function public.get_admins() to authenticated, service_role;

-- 6. Helper function to add admin by email
create or replace function public.add_admin_by_email(target_email text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No registered user found with email %.' , target_email using errcode = '22023';
  end if;

  perform public.add_admin(v_user_id);
  return v_user_id;
end;
$$;

revoke all on function public.add_admin_by_email(text) from public, anon;
grant execute on function public.add_admin_by_email(text) to authenticated, service_role;
