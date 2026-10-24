-- Physical cash has two audit actors: the admin who entered the attendee and
-- the admin who collected the payment. Recording collection confirms the ticket.

-- Cash records already waiting for a separate review were collected; remove that
-- extra review state and keep the two collection/registration actor fields.
update public.reservations
set status = 'approved',
    reviewed_at = null,
    reviewed_by = null,
    review_note = null,
    updated_at = now()
where registration_source = 'in_person'
  and payment_method = 'cash'
  and status = 'pending_review'
  and payment_received_at is not null
  and payment_received_by is not null;

-- Clear legacy reviewer fields on physical-cash rows; cash has no review actor.
update public.reservations
set reviewed_at = null,
    reviewed_by = null,
    updated_at = now()
where registration_source = 'in_person'
  and payment_method = 'cash'
  and (reviewed_at is not null or reviewed_by is not null);

drop function if exists public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean);
drop function if exists private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean);
drop function if exists public.record_cash_received(uuid);
drop function if exists private.record_cash_received(uuid);

create function private.create_cash_registration(
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
  v_status text := case when p_cash_received is true then 'approved' else 'awaiting_payment' end;
  v_school_index text := nullif(trim(p_school_index_number), '');
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Registration request is missing. Please try again.' using errcode = '22023';
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

  -- Make retries safe if the RPC committed but the client lost its response.
  -- The same request ID may only replay the same attendee data. A retry may
  -- monotonically record collection for a previously unpaid reservation.
  select * into v_reservation
  from public.reservations
  where registration_request_id = p_request_id
  for update;
  if found then
    if v_reservation.registration_source <> 'in_person'
      or v_reservation.payment_method <> 'cash'
      or v_reservation.full_name is distinct from trim(p_full_name)
      or lower(trim(v_reservation.email)) is distinct from v_email
      or v_reservation.whatsapp is distinct from p_whatsapp
      or v_reservation.nic_number is distinct from p_nic_number
      or v_reservation.school_index_number is distinct from v_school_index
      or v_reservation.school_joined_year is distinct from p_school_joined_year then
      raise exception 'This registration request was already used for different attendee details.' using errcode = '22023';
    end if;

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
    return v_reservation;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  if exists (select 1 from public.reservations where lower(trim(email)) = v_email) then
    raise exception 'A reservation already uses this email address.' using errcode = '23505';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email::text) = v_email
    and email_confirmed_at is not null
    and not coalesce(is_anonymous, false)
  limit 1;
  if v_user_id is not null and exists (
    select 1 from public.reservations where user_id = v_user_id
  ) then
    raise exception 'This account already has a reservation.' using errcode = '23505';
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
    p_whatsapp, v_email, v_event.ticket_price_lkr, v_status, null,
    null, null, 'in_person', 'cash', v_received_at,
    case when p_cash_received is true then p_payment_collector else null end,
    p_request_id, v_admin
  ) returning * into v_reservation;

  if p_cash_received is true then
    insert into public.payment_events (
      reservation_id, event_type, payment_method, amount_lkr, admin_id, note
    ) values (
      v_reservation.id, 'cash_received', 'cash', v_reservation.amount_lkr,
      p_payment_collector, 'Physical cash received during in-person registration'
    );
  end if;
  return v_reservation;
end;
$$;

create function public.create_cash_registration(
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
  select private.create_cash_registration(
    p_request_id, p_full_name, p_email, p_whatsapp, p_nic_number,
    p_school_index_number, p_school_joined_year, p_cash_received, p_payment_collector
  );
$$;

create function private.record_cash_received(p_reservation_id uuid, p_payment_collector uuid)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
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

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;
  if not found then raise exception 'Reservation not found.' using errcode = '22023'; end if;
  if v_reservation.registration_source <> 'in_person' or v_reservation.payment_method <> 'cash' then
    raise exception 'This is not an in-person physical cash registration.' using errcode = '22023';
  end if;
  if v_reservation.status = 'approved' and v_reservation.payment_received_at is not null then
    return v_reservation;
  end if;
  if v_reservation.status not in ('awaiting_payment', 'rejected') then
    raise exception 'This physical cash payment cannot be recorded in its current state.' using errcode = '22023';
  end if;

  update public.reservations
  set status = 'approved',
      payment_received_at = now(),
      payment_received_by = p_payment_collector,
      reviewed_at = null,
      reviewed_by = null,
      review_note = null,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.payment_events (
    reservation_id, event_type, payment_method, amount_lkr, admin_id, note
  ) values (
    p_reservation_id, 'cash_received', 'cash', v_reservation.amount_lkr,
    p_payment_collector, 'Physical cash collection recorded by admin'
  );
  return v_reservation;
end;
$$;

create function public.record_cash_received(p_reservation_id uuid, p_payment_collector uuid)
returns public.reservations
language sql
security invoker
set search_path = ''
as $$ select private.record_cash_received(p_reservation_id, p_payment_collector); $$;

create or replace function private.review_reservation(
  p_reservation_id uuid,
  p_decision text,
  p_receipt_path text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_review_id uuid;
  v_notification_id uuid;
  v_event public.event_settings;
  v_note text := nullif(trim(p_note), '');
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.' using errcode = '22023';
  end if;
  if length(v_note) > 1000 or (p_decision = 'rejected' and v_note is null) then
    raise exception 'A rejection needs a reason of up to 1,000 characters.' using errcode = '22023';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;
  if not found then raise exception 'Reservation not found.' using errcode = '22023'; end if;
  if v_reservation.registration_source = 'in_person' and v_reservation.payment_method = 'cash' then
    raise exception 'Physical cash is confirmed when its collector is recorded; it does not use receipt review.' using errcode = '22023';
  end if;
  if v_reservation.status <> 'pending_review' then
    raise exception 'This reservation is not waiting for payment review.' using errcode = '22023';
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

  select * into strict v_event
  from public.event_settings
  where id = v_reservation.event_id;
  insert into public.notification_outbox(reservation_id, review_id, recipient_email, payload)
  values (p_reservation_id, v_review_id, v_reservation.email, jsonb_build_object(
    'event_name', v_event.name,
    'reference', v_reservation.reference,
    'full_name', v_reservation.full_name,
    'status', p_decision,
    'review_note', v_note,
    'amount_lkr', v_reservation.amount_lkr,
    'payment_method', v_reservation.payment_method,
    'starts_at', v_event.starts_at,
    'venue', v_event.venue
  )) returning id into v_notification_id;

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean, uuid),
  public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean, uuid),
  private.record_cash_received(uuid, uuid), public.record_cash_received(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean, uuid),
  public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean, uuid),
  private.record_cash_received(uuid, uuid), public.record_cash_received(uuid, uuid)
  to authenticated;

comment on column public.reservations.registered_by is 'Admin who entered an in-person registration.';
comment on column public.reservations.payment_received_by is 'Admin who collected the physical cash payment.';
comment on function public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean, uuid)
  is 'Creates an in-person reservation and records the registration admin and optional cash collector.';
comment on function public.record_cash_received(uuid, uuid)
  is 'Records the physical cash collector and confirms the in-person reservation.';

notify pgrst, 'reload schema';
