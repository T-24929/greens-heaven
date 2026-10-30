-- Allow in-person registration to accept bank transfer receipts as online payments.
-- Updates receipt storage upload/read RLS policies to allow verified admins to upload receipts.
-- Adds create_admin_registration supporting both physical cash and bank transfer receipts.

create or replace function private.can_upload_receipt(p_name text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  if not private.is_verified_user() or p_name is null or p_name !~
    ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$') then
    return false;
  end if;

  -- Allow admins to upload receipts during in-person registration or receipt entry
  if private.is_admin() then
    return (select count(*) from storage.objects o where o.bucket_id = 'receipts'
      and split_part(o.name, '/', 1) = auth.uid()::text
      and split_part(o.name, '/', 2) = split_part(p_name, '/', 2)) < 10;
  end if;

  -- Serialize this account's Storage inserts so parallel uploads cannot bypass
  -- the object limit. Volatile PL/pgSQL sees a fresh count after obtaining the lock.
  select * into v_reservation from public.reservations r
    where r.id::text = split_part(p_name, '/', 2) and r.user_id = auth.uid() for update;
  if not found or v_reservation.status not in ('awaiting_payment', 'rejected') then return false; end if;
  return exists (select 1 from public.bank_details b where b.event_id = v_reservation.event_id)
    and (select count(*) from storage.objects o where o.bucket_id = 'receipts'
      and split_part(o.name, '/', 1) = auth.uid()::text
      and split_part(o.name, '/', 2) = v_reservation.id::text) < 10;
end;
$$;

create or replace function private.can_read_receipt(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and private.is_verified_user() and (
    private.is_admin()
    or exists (
      select 1 from public.reservations r
      where (r.id::text = split_part(p_name, '/', 2) or r.registration_request_id::text = split_part(p_name, '/', 2))
        and r.user_id = auth.uid()
    )
  );
$$;

create or replace function private.create_admin_registration(
  p_request_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_nic_number text,
  p_school_index_number text,
  p_school_joined_year integer,
  p_payment_method text,
  p_cash_received boolean default false,
  p_payment_collector uuid default null,
  p_receipt_path text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_event public.event_settings;
  v_reservation public.reservations;
  v_received_at timestamptz;
  v_school_index text := nullif(trim(p_school_index_number), '');
  v_payment_method text := lower(trim(coalesce(p_payment_method, 'cash')));
  v_status text;
  v_registration_source text;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Registration request is missing. Please try again.' using errcode = '22023';
  end if;
  if v_payment_method not in ('cash', 'bank_transfer') then
    raise exception 'Payment method must be cash or bank_transfer.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  if p_full_name is null or length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Enter a full name between 2 and 120 characters.' using errcode = '22023';
  end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+([.][^@[:space:]]+)+$' then
    raise exception 'Enter a valid attendee email address.' using errcode = '22023';
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^\+947[0-9]{8}$' then
    raise exception 'Enter a valid Sri Lankan WhatsApp number.' using errcode = '22023';
  end if;
  if p_nic_number is null or p_nic_number !~ '^([0-9]{9}[VX]|[0-9]{12})$' then
    raise exception 'Enter a valid Sri Lankan NIC number.' using errcode = '22023';
  end if;
  if p_school_index_number is not null and p_school_index_number !~ '^[0-9]{5}$' then
    raise exception 'Enter a valid 5-digit school index number or leave it blank.' using errcode = '22023';
  end if;
  if p_school_joined_year is null or p_school_joined_year not between 2010 and 2026 then
    raise exception 'Choose a valid school joined year.' using errcode = '22023';
  end if;

  if v_payment_method = 'cash' then
    if p_receipt_path is not null then
      raise exception 'Physical cash registrations do not use a receipt path.' using errcode = '22023';
    end if;
    v_registration_source := 'in_person';
    v_status := case when p_cash_received is true then 'approved' else 'awaiting_payment' end;

    if p_cash_received is true then
      if p_payment_collector is null or not exists (
        select 1
        from auth.users u
        where u.id = p_payment_collector
          and not coalesce(u.is_anonymous, false)
          and (
            exists (select 1 from private.admins a where a.user_id = u.id)
            or coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
            or coalesce(u.raw_app_meta_data ->> 'is_admin', 'false') = 'true'
          )
      ) then
        raise exception 'Choose an admin who collected the physical cash.' using errcode = '22023';
      end if;
      v_received_at := now();
    elsif p_payment_collector is not null then
      raise exception 'A cash collector can only be recorded after payment is collected.' using errcode = '22023';
    end if;
  else
    -- Bank transfer: adapts to system as an online payment in pending_review
    v_registration_source := 'online';
    v_status := 'pending_review';

    if p_receipt_path is null or p_receipt_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$') then
      raise exception 'Invalid receipt path.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'receipts'
        and o.name = p_receipt_path
        and o.owner_id = auth.uid()::text
        and o.metadata->>'mimetype' in ('application/pdf', 'image/jpeg', 'image/png')
        and case when (o.metadata->>'size') ~ '^[0-9]+$'
          then (o.metadata->>'size')::numeric between 1 and 5242880 else false end
    ) then
      raise exception 'Upload a valid receipt before submitting it.' using errcode = '22023';
    end if;
    if exists (select 1 from public.receipt_submissions where receipt_path = p_receipt_path) then
      raise exception 'Upload a new receipt for this review.' using errcode = '22023';
    end if;
  end if;

  select * into v_reservation
  from public.reservations
  where registration_request_id = p_request_id
  for update;
  if found then
    if v_reservation.payment_method <> v_payment_method
      or v_reservation.full_name is distinct from trim(p_full_name)
      or lower(trim(v_reservation.email)) is distinct from v_email
      or v_reservation.whatsapp is distinct from p_whatsapp
      or v_reservation.nic_number is distinct from p_nic_number
      or v_reservation.school_index_number is distinct from v_school_index
      or v_reservation.school_joined_year is distinct from p_school_joined_year then
      raise exception 'This registration request was already used for different attendee details.' using errcode = '22023';
    end if;

    if v_payment_method = 'cash' then
      if p_cash_received is true and v_reservation.payment_received_at is null then
        update public.reservations
        set status = 'approved',
            payment_received_at = now(),
            payment_received_by = p_payment_collector,
            updated_at = now()
        where id = v_reservation.id
        returning * into v_reservation;

        insert into public.payment_events (
          reservation_id, event_type, payment_method, amount_lkr, admin_id, note
        ) values (
          v_reservation.id, 'cash_received', 'cash', v_reservation.amount_lkr,
          p_payment_collector, 'Physical cash received during in-person registration'
        );
      elsif p_cash_received is true
        and v_reservation.payment_received_by is distinct from p_payment_collector then
        raise exception 'This registration request already records a different cash collector.' using errcode = '22023';
      end if;
    end if;

    return v_reservation;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  if exists (select 1 from public.reservations where lower(trim(email)) = v_email) then
    raise exception 'A reservation already uses this email address.' using errcode = '23505';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email::text) = v_email
    and not coalesce(is_anonymous, false)
  limit 1;

  if v_user_id is not null then
    if exists (
      select 1 from public.reservations where user_id = v_user_id
    ) then
      raise exception 'This account already has a reservation.' using errcode = '23505';
    end if;

    -- When verified in person by an organizer, confirm any pre-existing unconfirmed account
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_user_id and email_confirmed_at is null;
  end if;

  select * into strict v_event
  from public.event_settings
  where id = 'greens-heaven-2026';

  insert into public.reservations (
    user_id, event_id, full_name, nic_number, school_index_number,
    school_joined_year, whatsapp, email, amount_lkr, status, receipt_path,
    reviewed_at, reviewed_by, registration_source, payment_method,
    payment_received_at, payment_received_by, registration_request_id, registered_by
  ) values (
    v_user_id, v_event.id, trim(p_full_name), p_nic_number,
    v_school_index, p_school_joined_year,
    p_whatsapp, v_email, v_event.ticket_price_lkr, v_status, p_receipt_path,
    null, null, v_registration_source, v_payment_method, v_received_at,
    case when v_payment_method = 'cash' and p_cash_received is true then p_payment_collector else null end,
    p_request_id, v_admin
  ) returning * into v_reservation;

  if v_payment_method = 'cash' and p_cash_received is true then
    insert into public.payment_events (
      reservation_id, event_type, payment_method, amount_lkr, admin_id, note
    ) values (
      v_reservation.id, 'cash_received', 'cash', v_reservation.amount_lkr,
      p_payment_collector, 'Physical cash received during in-person registration'
    );
  elsif v_payment_method = 'bank_transfer' then
    insert into public.receipt_submissions (reservation_id, receipt_path)
    values (v_reservation.id, p_receipt_path);
  end if;

  return v_reservation;
end;
$$;

create or replace function public.create_admin_registration(
  p_request_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_nic_number text,
  p_school_index_number text,
  p_school_joined_year integer,
  p_payment_method text,
  p_cash_received boolean default false,
  p_payment_collector uuid default null,
  p_receipt_path text default null
)
returns public.reservations
language sql
security invoker
set search_path = ''
as $$
  select private.create_admin_registration(
    p_request_id, p_full_name, p_email, p_whatsapp, p_nic_number,
    p_school_index_number, p_school_joined_year, p_payment_method,
    p_cash_received, p_payment_collector, p_receipt_path
  );
$$;

create or replace function public.create_cash_registration(
  p_request_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_nic_number text,
  p_school_index_number text,
  p_school_joined_year integer,
  p_cash_received boolean,
  p_payment_collector uuid
)
returns public.reservations
language sql
security invoker
set search_path = ''
as $$
  select private.create_admin_registration(
    p_request_id, p_full_name, p_email, p_whatsapp, p_nic_number,
    p_school_index_number, p_school_joined_year, 'cash',
    p_cash_received, p_payment_collector, null
  );
$$;

-- Allow claiming in-person and admin-created reservations
create or replace function private.claim_in_person_reservation()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_reservation_id uuid;
begin
  if not private.is_verified_user() then
    raise exception 'Verify your email before claiming an in-person ticket.' using errcode = '42501';
  end if;
  select lower(email::text) into v_email from auth.users where id = v_user_id;
  if v_email is null then return false; end if;

  if exists (select 1 from public.reservations where user_id = v_user_id) then
    return true;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  select id into v_reservation_id from public.reservations
    where user_id is null and (registration_source = 'in_person' or registered_by is not null)
      and lower(email) = v_email
    order by created_at asc
    limit 1
    for update;
  if v_reservation_id is not null then
    update public.reservations set user_id = v_user_id, updated_at = now()
      where id = v_reservation_id and user_id is null;
  end if;
  return exists (select 1 from public.reservations where user_id = v_user_id);
exception when unique_violation then
  raise exception 'This account already has a ticket. Contact an organizer to resolve it.' using errcode = '23505';
end;
$$;

-- Allow account setup notifications for admin-registered attendees
create or replace function public.queue_account_setup_notification(p_reservation_id uuid)
returns table(notification_id uuid, status text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_notification public.notification_outbox;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id;

  if not found or (v_reservation.registration_source <> 'in_person' and v_reservation.registered_by is null) then
    raise exception 'In-person registration not found.' using errcode = '22023';
  end if;

  if v_reservation.user_id is not null then
    return query select null::uuid, 'already_linked'::text, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('setup:' || p_reservation_id::text, 0));

  select * into v_notification
  from public.notification_outbox n
  where n.reservation_id = p_reservation_id
    and n.notification_type = 'account_setup'
  order by n.created_at desc, n.id desc
  limit 1
  for update;

  if found then
    return query select v_notification.id, v_notification.status, v_notification.attempts;
    return;
  end if;

  insert into public.notification_outbox (
    reservation_id, review_id, notification_type, recipient_email, payload
  ) values (
    v_reservation.id, null, 'account_setup', v_reservation.email,
    jsonb_build_object('full_name', v_reservation.full_name, 'reference', v_reservation.reference)
  ) returning * into v_notification;

  return query select v_notification.id, v_notification.status, v_notification.attempts;
end;
$$;

revoke all on function private.create_admin_registration(uuid, text, text, text, text, text, integer, text, boolean, uuid, text),
  public.create_admin_registration(uuid, text, text, text, text, text, integer, text, boolean, uuid, text)
from public, anon, authenticated;

grant execute on function private.create_admin_registration(uuid, text, text, text, text, text, integer, text, boolean, uuid, text),
  public.create_admin_registration(uuid, text, text, text, text, text, integer, text, boolean, uuid, text)
to authenticated, service_role;

notify pgrst, 'reload schema';
