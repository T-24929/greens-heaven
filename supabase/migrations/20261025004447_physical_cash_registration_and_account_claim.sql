-- In-person registrations are created by an admin, with a cash receipt audit
-- row. The attendee claims an unlinked reservation only after verifying the
-- same email address through Supabase Auth.

alter table public.reservations alter column user_id drop not null;
alter table public.reservations
  add column registration_source text not null default 'online'
    check (registration_source in ('online', 'in_person')),
  add column payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer', 'cash')),
  add column payment_received_at timestamptz,
  add column payment_received_by uuid references auth.users(id),
  add column account_setup_sent_at timestamptz,
  add column registration_request_id uuid unique;

alter table public.reservations drop constraint if exists reservations_check;
alter table public.reservations
  add constraint reservations_receipt_status_check check (
    (status = 'awaiting_payment' and receipt_path is null)
    or (registration_source = 'in_person' and payment_method = 'cash'
      and status in ('pending_review', 'approved', 'rejected') and receipt_path is null)
    or (status <> 'awaiting_payment' and receipt_path is not null)
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

create unique index reservations_unclaimed_in_person_email_uq
  on public.reservations (lower(email))
  where user_id is null and registration_source = 'in_person';

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  event_type text not null check (event_type in ('cash_received')),
  payment_method text not null check (payment_method = 'cash'),
  amount_lkr integer not null check (amount_lkr > 0),
  admin_id uuid not null references auth.users(id),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);
create index payment_events_reservation_created_idx
  on public.payment_events(reservation_id, created_at desc);
create index payment_events_admin_created_idx
  on public.payment_events(admin_id, created_at desc);

alter table public.payment_events enable row level security;
create policy payment_events_admin_read on public.payment_events for select to authenticated
  using ((select private.is_admin()));
revoke all on public.payment_events from public, anon, authenticated;
grant select on public.payment_events to authenticated, service_role;
grant update (account_setup_sent_at) on public.reservations to service_role;

create function private.create_cash_registration(
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

  -- Make a retried request safe if the browser lost the response after commit.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_reservation from public.reservations
    where registration_request_id = p_request_id;
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
  if v_user_id is not null and exists (
    select 1 from public.reservations where user_id = v_user_id
  ) then
    raise exception 'This account already has a reservation.' using errcode = '23505';
  end if;

  select * into strict v_event from public.event_settings where id = 'greens-heaven-2026';
  if p_cash_received is true then v_received_at := now(); end if;
  insert into public.reservations (
    user_id, event_id, full_name, nic_number, school_index_number,
    school_joined_year, whatsapp, email, amount_lkr, status, receipt_path,
    reviewed_at, reviewed_by, registration_source, payment_method,
    payment_received_at, payment_received_by, registration_request_id
  ) values (
    v_user_id, v_event.id, trim(p_full_name), p_nic_number,
    nullif(trim(p_school_index_number), ''), p_school_joined_year,
    p_whatsapp, v_email, v_event.ticket_price_lkr, v_status, null,
    null, null, 'in_person', 'cash', v_received_at,
    case when p_cash_received is true then v_admin else null end, p_request_id
  ) returning * into v_reservation;

  if p_cash_received is true then
    insert into public.payment_events (
      reservation_id, event_type, payment_method, amount_lkr, admin_id, note
    ) values (
      v_reservation.id, 'cash_received', 'cash', v_reservation.amount_lkr,
      v_admin, 'Cash received during in-person registration'
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
  p_cash_received boolean
)
returns public.reservations language sql security invoker set search_path = ''
as $$
  select private.create_cash_registration(
    p_request_id, p_full_name, p_email, p_whatsapp, p_nic_number,
    p_school_index_number, p_school_joined_year, p_cash_received
  );
$$;

create function private.claim_in_person_reservation()
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
    where user_id is null and registration_source = 'in_person'
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

create function public.claim_in_person_reservation()
returns boolean language sql security invoker set search_path = ''
as $$ select private.claim_in_person_reservation(); $$;

revoke all on function private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  private.claim_in_person_reservation(), public.claim_in_person_reservation()
  from public, anon, authenticated, service_role;
grant execute on function private.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  public.create_cash_registration(uuid, text, text, text, text, text, integer, boolean),
  private.claim_in_person_reservation(), public.claim_in_person_reservation()
  to authenticated;

comment on table public.payment_events is 'Append-only payment audit events. Cash receipts record who received the money, amount, and time.';
comment on column public.reservations.registration_source is 'Online reservation or admin-entered in-person registration.';
comment on column public.reservations.payment_method is 'Bank transfer receipt or cash accepted in person.';
comment on column public.reservations.account_setup_sent_at is 'Latest successful account setup or password reset email delivery request.';

notify pgrst, 'reload schema';
