-- Allow in-person cash registration to recognize accounts matching the attendee's email,
-- auto-confirming unconfirmed accounts so physical entrants are not locked out of their tickets.

create or replace function private.create_cash_registration(
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

notify pgrst, 'reload schema';
