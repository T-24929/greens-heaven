-- Separate in-person registration, cash collection, and payment approval.
-- Registration may be saved before payment; cash collection moves it to review,
-- and an admin can review that cash record. A second admin may review it when needed.

alter table public.reservations
  add column if not exists registered_by uuid references auth.users(id);

alter table public.reservations
  drop constraint if exists reservations_cash_payment_check;

-- Older in-person records may predate this audit field. Leave their creator unknown;
-- the current registration function records the authenticated admin for new rows.
alter table public.reservations
  drop constraint if exists reservations_in_person_registered_by_check;

-- Cash reviews have no receipt file; preserve the reviewer and decision in the same audit table.
alter table public.review_history alter column receipt_path drop not null;

alter table public.reservations drop constraint if exists reservations_receipt_status_check;
alter table public.reservations
  add constraint reservations_receipt_status_check check (
    (registration_source = 'in_person' and payment_method = 'cash'
      and status = 'awaiting_payment' and receipt_path is null)
    or (registration_source = 'in_person' and payment_method = 'cash'
      and status in ('pending_review', 'approved', 'rejected') and receipt_path is null)
    or (registration_source = 'online' and status = 'awaiting_payment' and receipt_path is null)
    or (registration_source = 'online' and status in ('pending_review', 'approved', 'rejected') and receipt_path is not null)
  ),
  add constraint reservations_cash_payment_check check (
    payment_method <> 'cash' or (
      registration_source = 'in_person'
      and (
        (status = 'awaiting_payment' and payment_received_at is null and payment_received_by is null)
        or (status in ('pending_review', 'approved', 'rejected')
          and payment_received_at is not null and payment_received_by is not null)
      )
    )
  );

alter table public.payment_events drop constraint if exists payment_events_event_type_check;
alter table public.payment_events
  add constraint payment_events_event_type_check
  check (event_type in ('cash_received', 'cash_approved', 'cash_rejected'));

create or replace function private.create_cash_registration(
  p_request_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_nic_number text,
  p_school_index_number text,
  p_school_joined_year integer,
  p_cash_received boolean
)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_event public.event_settings;
  v_reservation public.reservations;
  v_received_at timestamptz;
  v_status text := case when p_cash_received is true then 'pending_review' else 'awaiting_payment' end;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Registration request is missing. Please try again.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_reservation from public.reservations where registration_request_id = p_request_id;
  if found then return v_reservation; end if;

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

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  if exists (select 1 from public.reservations where lower(trim(email)) = v_email) then
    raise exception 'A reservation already uses this email address.' using errcode = '23505';
  end if;

  select id into v_user_id from auth.users
    where lower(email::text) = v_email and email_confirmed_at is not null
      and not coalesce(is_anonymous, false)
    limit 1;
  if v_user_id is not null and exists (select 1 from public.reservations where user_id = v_user_id) then
    raise exception 'This account already has a reservation.' using errcode = '23505';
  end if;

  select * into strict v_event from public.event_settings where id = 'greens-heaven-2026';
  if p_cash_received is true then v_received_at := now(); end if;

  insert into public.reservations (
    user_id, event_id, full_name, nic_number, school_index_number,
    school_joined_year, whatsapp, email, amount_lkr, status, receipt_path,
    reviewed_at, reviewed_by, registration_source, payment_method,
    payment_received_at, payment_received_by, registration_request_id, registered_by
  ) values (
    v_user_id, v_event.id, trim(p_full_name), p_nic_number,
    nullif(trim(p_school_index_number), ''), p_school_joined_year,
    p_whatsapp, v_email, v_event.ticket_price_lkr, v_status, null,
    null, null, 'in_person', 'cash', v_received_at,
    case when p_cash_received is true then v_admin else null end,
    p_request_id, v_admin
  ) returning * into v_reservation;

  if p_cash_received is true then
    insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
    values (v_reservation.id, 'cash_received', 'cash', v_reservation.amount_lkr, v_admin, 'Cash received during in-person registration');
  end if;
  return v_reservation;
end;
$$;

create or replace function public.create_cash_registration(
  p_request_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_nic_number text,
  p_school_index_number text,
  p_school_joined_year integer,
  p_cash_received boolean
)
returns public.reservations language sql security invoker set search_path = ''
as $$
  select private.create_cash_registration(
    p_request_id, p_full_name, p_email, p_whatsapp, p_nic_number,
    p_school_index_number, p_school_joined_year, p_cash_received
  );
$$;

create or replace function private.record_cash_received(p_reservation_id uuid)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.' using errcode = '22023'; end if;
  if v_reservation.registration_source <> 'in_person' or v_reservation.payment_method <> 'cash' then
    raise exception 'This is not an in-person cash registration.' using errcode = '22023';
  end if;
  if v_reservation.status = 'pending_review' and v_reservation.payment_received_at is not null then
    return v_reservation;
  end if;
  if v_reservation.status not in ('awaiting_payment', 'rejected') then
    raise exception 'This cash payment cannot be recorded in its current state.' using errcode = '22023';
  end if;

  update public.reservations
  set status = 'pending_review',
      payment_received_at = now(),
      payment_received_by = auth.uid(),
      reviewed_at = null,
      reviewed_by = null,
      review_note = null,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
  values (p_reservation_id, 'cash_received', 'cash', v_reservation.amount_lkr, auth.uid(), 'Cash payment recorded by admin');
  return v_reservation;
end;
$$;

create or replace function public.record_cash_received(p_reservation_id uuid)
returns public.reservations language sql security invoker set search_path = ''
as $$ select private.record_cash_received(p_reservation_id); $$;

create or replace function private.review_reservation(p_reservation_id uuid, p_decision text, p_receipt_path text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_review_id uuid;
  v_notification_id uuid;
  v_event public.event_settings;
  v_note text := nullif(trim(p_note), '');
  v_is_cash boolean;
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
    raise exception 'This reservation is not waiting for payment review.' using errcode = '22023';
  end if;

  v_is_cash := v_reservation.registration_source = 'in_person' and v_reservation.payment_method = 'cash';
  if v_is_cash then
    if p_receipt_path is not null or v_reservation.receipt_path is not null then
      raise exception 'Cash payments do not use a receipt slip.' using errcode = '22023';
    end if;
    if v_reservation.payment_received_at is null or v_reservation.payment_received_by is null then
      raise exception 'Record the cash collection before reviewing it.' using errcode = '22023';
    end if;
  else
    if p_receipt_path is distinct from v_reservation.receipt_path then
      raise exception 'The receipt changed. Refresh before reviewing.' using errcode = '22023';
    end if;
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

  if v_is_cash then
    insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
    values (p_reservation_id, case when p_decision = 'approved' then 'cash_approved' else 'cash_rejected' end,
      'cash', v_reservation.amount_lkr, auth.uid(), coalesce(v_note, 'Cash payment reviewed'));
  end if;

  select * into strict v_event from public.event_settings where id = v_reservation.event_id;
  insert into public.notification_outbox(reservation_id, review_id, recipient_email, payload)
  values (p_reservation_id, v_review_id, v_reservation.email, jsonb_build_object(
    'event_name', v_event.name, 'reference', v_reservation.reference,
    'full_name', v_reservation.full_name, 'status', p_decision, 'review_note', v_note,
    'amount_lkr', v_reservation.amount_lkr, 'payment_method', v_reservation.payment_method,
    'starts_at', v_event.starts_at, 'venue', v_event.venue
  )) returning id into v_notification_id;

  return jsonb_build_object('reservation', to_jsonb(v_reservation), 'notification_id', v_notification_id);
end;
$$;

create or replace function public.review_reservation(p_reservation_id uuid, p_decision text, p_receipt_path text, p_note text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.review_reservation(p_reservation_id, p_decision, p_receipt_path, p_note); $$;

revoke all on function private.record_cash_received(uuid), public.record_cash_received(uuid) from public, anon, authenticated, service_role;
grant execute on function private.record_cash_received(uuid), public.record_cash_received(uuid) to authenticated;
revoke all on function private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  private.review_reservation(uuid, text, text, text), public.review_reservation(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  private.review_reservation(uuid, text, text, text), public.review_reservation(uuid, text, text, text)
  to authenticated;

comment on column public.reservations.registered_by is 'Admin who entered an in-person registration.';
comment on function public.record_cash_received(uuid) is 'Records an in-person cash payment and queues it for admin review.';

notify pgrst, 'reload schema';
