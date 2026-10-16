-- Client writes go through narrow, authenticated RPCs. Keep `private` out of
-- the Data API exposed schemas. Apply this migration to a fresh project.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.event_settings (
  id text primary key check (id = 'greens-heaven-2026'),
  name text not null,
  starts_at timestamptz not null,
  venue text not null,
  ticket_price_lkr integer not null check (ticket_price_lkr > 0),
  reservations_open boolean not null default true
);

insert into public.event_settings (id, name, starts_at, venue, ticket_price_lkr)
values ('greens-heaven-2026', 'Greens Heaven', '2026-10-31 17:30:00+05:30', 'Solis Hotel', 6500);

create table public.bank_details (
  event_id text primary key references public.event_settings(id),
  bank_name text not null check (length(trim(bank_name)) between 1 and 120),
  account_name text not null check (length(trim(account_name)) between 1 and 120),
  account_number text not null check (length(trim(account_number)) between 1 and 80),
  branch text not null default '',
  payment_instructions text not null default '',
  is_demo boolean not null default true
);

insert into public.bank_details
  (event_id, bank_name, account_name, account_number, branch, payment_instructions, is_demo)
values ('greens-heaven-2026', 'Demo bank', 'Greens Heaven — demo only',
  'DEMO-NOT-FOR-PAYMENT', 'Demo branch',
  'For testing only. Do not transfer money to these details.', true);

create table private.admins (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);

create sequence private.reservation_reference_seq start with 1;
grant usage on sequence private.reservation_reference_seq to authenticated, service_role;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  event_id text not null default 'greens-heaven-2026' references public.event_settings(id),
  reference text not null unique default ('GH-' || lpad(nextval('private.reservation_reference_seq')::text, 3, '0')),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  nic_number text not null check (nic_number ~ '^([0-9]{9}[VX]|[0-9]{12})$'),
  school_index_number text check (school_index_number is null or school_index_number ~ '^[0-9]{5}$'),
  school_joined_year smallint not null check (school_joined_year between 2000 and 2026),
  whatsapp text not null check (whatsapp ~ '^\+947[0-9]{8}$'),
  email text not null,
  amount_lkr integer not null check (amount_lkr > 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'pending_review', 'approved', 'rejected')),
  receipt_path text,
  review_note text check (length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((status = 'awaiting_payment' and receipt_path is null)
    or (status <> 'awaiting_payment' and receipt_path is not null))
);
create index reservations_status_created_at_idx on public.reservations(status, created_at desc);
create index reservations_created_at_idx on public.reservations(created_at desc);
create index reservations_event_id_idx on public.reservations(event_id);

create table public.receipt_submissions (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  receipt_path text not null unique,
  submitted_at timestamptz not null default now()
);
create index receipt_submissions_reservation_id_idx
  on public.receipt_submissions(reservation_id, submitted_at desc);

create table public.review_history (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  admin_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  note text check (length(note) <= 1000),
  receipt_path text not null,
  created_at timestamptz not null default now()
);
create index review_history_reservation_id_idx on public.review_history(reservation_id, created_at desc);
create index review_history_admin_id_idx on public.review_history(admin_id);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  review_id uuid not null unique references public.review_history(id),
  recipient_email text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'unknown')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index notification_outbox_reservation_id_idx on public.notification_outbox(reservation_id, created_at desc);
create index notification_outbox_queue_idx on public.notification_outbox(status, created_at)
  where status in ('pending', 'failed');

alter table public.event_settings enable row level security;
alter table public.bank_details enable row level security;
alter table private.admins enable row level security;
alter table public.reservations enable row level security;
alter table public.receipt_submissions enable row level security;
alter table public.review_history enable row level security;
alter table public.notification_outbox enable row level security;

-- Verified identity comes from Auth's protected row, never user-editable metadata.
create function private.is_verified_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.email is not null and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
  );
$$;

create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and private.is_verified_user() and exists (
    select 1 from private.admins a where a.user_id = auth.uid()
  );
$$;

create function public.is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_admin(); $$;

create policy event_settings_read on public.event_settings for select to anon, authenticated using (true);
create policy bank_details_authenticated_read on public.bank_details for select to authenticated
  using ((select private.is_verified_user()));
create policy reservations_owner_or_admin_read on public.reservations for select to authenticated
  using ((select private.is_verified_user()) and
    (user_id = (select auth.uid()) or (select private.is_admin())));
create policy receipts_owner_or_admin_read on public.receipt_submissions for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id));
create policy review_history_admin_read on public.review_history for select to authenticated
  using ((select private.is_admin()));
create policy notification_outbox_admin_read on public.notification_outbox for select to authenticated
  using ((select private.is_admin()));

-- Revoking table mutations as well as withholding write policies prevents a
-- future permissive policy from accidentally allowing price/status overrides.
revoke all on public.event_settings, public.bank_details, public.reservations,
  public.receipt_submissions, public.review_history, public.notification_outbox
  from public, anon, authenticated;
revoke all on private.admins from public, anon, authenticated;
grant select on public.event_settings to anon, authenticated;
grant select on public.bank_details, public.reservations, public.receipt_submissions,
  public.review_history, public.notification_outbox to authenticated;
grant select on public.event_settings, public.reservations, public.notification_outbox to service_role;

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
  -- Serialize duplicate clicks for this account. The unique constraint is the
  -- final guard; a repeated request returns the same reservation unchanged.
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

-- New object names must have exactly three path components. An upload cannot
-- replace a submitted receipt, and closed/approved tickets accept no uploads.
create function private.can_upload_receipt(p_name text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  if not private.is_verified_user() or p_name is null or p_name !~
    ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$') then
    return false;
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

create function private.can_read_receipt(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and private.is_verified_user() and exists (
    select 1 from public.reservations r
    where r.id::text = split_part(p_name, '/', 2)
      and r.user_id::text = split_part(p_name, '/', 1)
      and (r.user_id = auth.uid() or private.is_admin())
  );
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png']);

create policy receipt_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and owner_id = (select auth.uid())::text and private.can_upload_receipt(name));
create policy receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and private.can_read_receipt(name));
-- Deliberately no UPDATE/DELETE policy: review evidence is immutable.

create function private.submit_receipt(p_reservation_id uuid, p_receipt_path text)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  if not private.is_verified_user() then
    raise exception 'Sign in with a verified email to submit a receipt.' using errcode = '42501';
  end if;
  select * into v_reservation from public.reservations
    where id = p_reservation_id and user_id = auth.uid() for update;
  if not found then raise exception 'Reservation not found.' using errcode = '42501'; end if;
  if v_reservation.status = 'pending_review' and p_receipt_path is not null
    and v_reservation.receipt_path = p_receipt_path then
    return v_reservation;
  end if;
  if v_reservation.status not in ('awaiting_payment', 'rejected') then
    raise exception 'This reservation is not accepting a new receipt.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.bank_details b where b.event_id = v_reservation.event_id) then
    raise exception 'Bank details are not available yet.' using errcode = '22023';
  end if;
  if p_receipt_path is null or p_receipt_path !~
    ('^' || auth.uid()::text || '/' || p_reservation_id::text || '/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$') then
    raise exception 'Invalid receipt path.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = p_receipt_path
    and o.owner_id = auth.uid()::text
    and o.metadata->>'mimetype' in ('application/pdf', 'image/jpeg', 'image/png')
    and case when (o.metadata->>'size') ~ '^[0-9]+$'
      then (o.metadata->>'size')::numeric between 1 and 5242880 else false end) then
    raise exception 'Upload a valid receipt before submitting it.' using errcode = '22023';
  end if;
  if exists (select 1 from public.receipt_submissions where receipt_path = p_receipt_path) then
    raise exception 'Upload a new receipt for this review.' using errcode = '22023';
  end if;
  if (select count(*) from public.receipt_submissions where reservation_id = p_reservation_id) >= 10 then
    raise exception 'Receipt limit reached. Contact an organizer.' using errcode = '22023';
  end if;
  insert into public.receipt_submissions(reservation_id, receipt_path)
    values (p_reservation_id, p_receipt_path);
  update public.reservations set status = 'pending_review', receipt_path = p_receipt_path,
    review_note = null, reviewed_at = null, updated_at = now()
    where id = p_reservation_id returning * into v_reservation;
  return v_reservation;
end;
$$;

create function public.submit_receipt(p_reservation_id uuid, p_receipt_path text)
returns public.reservations language sql security invoker set search_path = ''
as $$ select private.submit_receipt(p_reservation_id, p_receipt_path); $$;

create function private.review_reservation(p_reservation_id uuid, p_decision text, p_receipt_path text, p_note text default null)
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

create function public.review_reservation(p_reservation_id uuid, p_decision text, p_receipt_path text, p_note text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.review_reservation(p_reservation_id, p_decision, p_receipt_path, p_note); $$;

-- These functions are service-role only. Claims are atomic; neither sending
-- nor ambiguous (unknown) deliveries can be automatically retried.
create function private.claim_notification(p_notification_id uuid)
returns setof public.notification_outbox language sql security definer set search_path = ''
as $$
  update public.notification_outbox set status = 'sending', attempts = attempts + 1,
    claim_token = gen_random_uuid(), claimed_at = now(), last_error = null
  where id = p_notification_id and status in ('pending', 'failed') and attempts < 5
    and exists (
      select 1 from public.reservations r join public.review_history h
        on h.reservation_id = r.id
      where r.id = notification_outbox.reservation_id and h.id = notification_outbox.review_id
        and r.status = h.decision and r.receipt_path = h.receipt_path
        and r.reviewed_at = h.created_at
    )
  returning *;
$$;

create function public.claim_notification(p_notification_id uuid)
returns setof public.notification_outbox language sql security invoker set search_path = ''
as $$ select * from private.claim_notification(p_notification_id); $$;

create function private.finish_notification(p_notification_id uuid, p_claim_token uuid, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('sent', 'failed', 'unknown') then
    raise exception 'Invalid delivery result.' using errcode = '22023';
  end if;
  update public.notification_outbox set status = p_status,
    sent_at = case when p_status = 'sent' then now() else null end,
    last_error = case when p_status = 'sent' then null else left(p_error, 500) end
  where id = p_notification_id and status = 'sending' and claim_token = p_claim_token;
  return found;
end;
$$;

create function public.finish_notification(p_notification_id uuid, p_claim_token uuid, p_status text, p_error text default null)
returns boolean language sql security invoker set search_path = ''
as $$ select private.finish_notification(p_notification_id, p_claim_token, p_status, p_error); $$;

revoke all on function private.is_verified_user(), private.is_admin(), public.is_admin(),
  private.reserve_ticket(text, text, text, text, integer), public.reserve_ticket(text, text, text, text, integer),
  private.can_upload_receipt(text), private.can_read_receipt(text),
  private.submit_receipt(uuid, text), public.submit_receipt(uuid, text),
  private.review_reservation(uuid, text, text, text), public.review_reservation(uuid, text, text, text),
  private.claim_notification(uuid), public.claim_notification(uuid),
  private.finish_notification(uuid, uuid, text, text), public.finish_notification(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.is_verified_user(), private.is_admin(), public.is_admin(),
  private.reserve_ticket(text, text, text, text, integer), public.reserve_ticket(text, text, text, text, integer),
  private.can_upload_receipt(text), private.can_read_receipt(text),
  private.submit_receipt(uuid, text), public.submit_receipt(uuid, text),
  private.review_reservation(uuid, text, text, text), public.review_reservation(uuid, text, text, text)
  to authenticated;
grant execute on function private.claim_notification(uuid), public.claim_notification(uuid),
  private.finish_notification(uuid, uuid, text, text), public.finish_notification(uuid, uuid, text, text)
  to service_role;

comment on schema private is 'Internal authorization and transactional mutations. Do not expose through Data API.';
comment on table public.notification_outbox is 'Decision emails. sending/unknown must be investigated before a manual retry; SMTP cannot promise exactly-once delivery.';
