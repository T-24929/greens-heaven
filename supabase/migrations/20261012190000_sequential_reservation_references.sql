-- Give new reservations short, readable GH-001 style references.
-- Existing references are preserved; the sequence continues after any
-- existing numeric GH reference so previously shared transfer references
-- are not changed.
create sequence if not exists private.reservation_reference_seq start with 1;
grant usage on sequence private.reservation_reference_seq to authenticated, service_role;

select setval(
  'private.reservation_reference_seq',
  greatest(coalesce(max((substring(reference from '^GH-([0-9]+)$'))::bigint), 0) + 1, 1),
  false
)
from public.reservations;

alter table public.reservations
  alter column reference set default ('GH-' || lpad(nextval('private.reservation_reference_seq')::text, 3, '0'));

-- This event only accepts Sri Lankan mobile numbers and prices in rupees.
-- E.164 +94 is kept internally so wa.me can address the number reliably;
-- attendees enter the familiar local 07... format in the website.
alter table public.event_settings drop column if exists currency;
alter table public.reservations drop column if exists currency;
alter table public.reservations drop constraint if exists reservations_whatsapp_check;
alter table public.reservations add constraint reservations_whatsapp_check
  check (whatsapp ~ '^\+947[0-9]{8}$');

-- Store the attendee's NIC and Isipathana records for organizer verification.
-- Nullable columns keep any pre-migration reservations intact; all new
-- reservations must provide valid values through the RPC below.
alter table public.reservations add column if not exists nic_number text;
alter table public.reservations add column if not exists school_index_number text;
alter table public.reservations add column if not exists school_joined_year smallint;
alter table public.reservations drop constraint if exists reservations_nic_number_check;
alter table public.reservations add constraint reservations_nic_number_check
  check (nic_number is null or nic_number ~ '^([0-9]{9}[VX]|[0-9]{12})$');
alter table public.reservations drop constraint if exists reservations_school_index_number_check;
alter table public.reservations add constraint reservations_school_index_number_check
  check (school_index_number is null or school_index_number ~ '^[0-9]{5}$');
alter table public.reservations drop constraint if exists reservations_school_joined_year_check;
alter table public.reservations add constraint reservations_school_joined_year_check
  check (school_joined_year is null or school_joined_year between 2000 and 2026);

drop function if exists public.reserve_ticket(text, text);
drop function if exists private.reserve_ticket(text, text);
drop function if exists public.reserve_ticket(text, text, text, text, smallint);
drop function if exists private.reserve_ticket(text, text, text, text, smallint);
drop function if exists public.reserve_ticket(text, text, text, text, integer);
drop function if exists private.reserve_ticket(text, text, text, text, integer);

create function private.reserve_ticket(p_full_name text, p_whatsapp text, p_nic_number text, p_school_index_number text, p_school_joined_year integer)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_reservation public.reservations;
  v_event public.event_settings;
  v_email text;
begin
  if not private.is_verified_user() then
    raise exception 'Sign in with a verified email to reserve a ticket.' using errcode = '42501';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Enter your full name (2–120 characters).' using errcode = '22023';
  end if;
  if p_nic_number is null or p_nic_number !~ '^([0-9]{9}[VX]|[0-9]{12})$' then
    raise exception 'Enter a valid Sri Lankan NIC number.' using errcode = '22023';
  end if;
  if p_school_index_number is not null and p_school_index_number !~ '^[0-9]{5}$' then
    raise exception 'Enter a valid 5-digit school index number, or leave it blank.' using errcode = '22023';
  end if;
  if p_school_joined_year is null or p_school_joined_year not between 2000 and 2026 then
    raise exception 'Choose the year you joined Isipathana College.' using errcode = '22023';
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^\+947[0-9]{8}$' then
    raise exception 'Enter a valid Sri Lankan mobile number.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_reservation from public.reservations where user_id = v_user;
  if found then return v_reservation; end if;
  select * into strict v_event from public.event_settings where id = 'greens-heaven-2026';
  if not v_event.reservations_open or v_event.starts_at <= now() then
    raise exception 'Ticket reservations are closed.' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.reservations(user_id, event_id, full_name, nic_number, school_index_number,
    school_joined_year, whatsapp, email, amount_lkr)
    values (v_user, v_event.id, trim(p_full_name), p_nic_number, p_school_index_number,
      p_school_joined_year, p_whatsapp, v_email, v_event.ticket_price_lkr)
    returning * into v_reservation;
  return v_reservation;
end;
$$;

create function public.reserve_ticket(p_full_name text, p_whatsapp text, p_nic_number text, p_school_index_number text, p_school_joined_year integer)
returns public.reservations language sql security invoker set search_path = ''
as $$ select private.reserve_ticket(p_full_name, p_whatsapp, p_nic_number, p_school_index_number, p_school_joined_year); $$;

revoke all on function private.reserve_ticket(text, text, text, text, integer),
  public.reserve_ticket(text, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function private.reserve_ticket(text, text, text, text, integer),
  public.reserve_ticket(text, text, text, text, integer) to authenticated;

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
  update public.reservations set status = p_decision, review_note = v_note, reviewed_at = now(), updated_at = now()
    where id = p_reservation_id returning * into v_reservation;
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
