-- Online reservations can be settled with cash collected by an organizer.
-- Cash receipt follows the same review, history, and notification flow as a bank slip.

alter table public.reservations
  drop constraint if exists reservations_receipt_status_check,
  drop constraint if exists reservations_cash_payment_check;

alter table public.reservations
  add constraint reservations_receipt_status_check check (
    (registration_source = 'in_person' and payment_method = 'cash'
      and status in ('awaiting_payment', 'pending_review', 'approved', 'rejected')
      and receipt_path is null)
    or (registration_source = 'online' and payment_method = 'cash'
      and status in ('pending_review', 'approved', 'rejected')
      and receipt_path is null)
    or (registration_source = 'online' and payment_method = 'bank_transfer'
      and status = 'awaiting_payment' and receipt_path is null)
    or (registration_source = 'online' and payment_method = 'bank_transfer'
      and status in ('pending_review', 'approved', 'rejected') and receipt_path is not null)
  ),
  add constraint reservations_cash_payment_check check (
    payment_method <> 'cash' or (
      (registration_source = 'in_person' and (
        (status = 'awaiting_payment' and payment_received_at is null and payment_received_by is null)
        or (status in ('pending_review', 'approved', 'rejected')
          and payment_received_at is not null and payment_received_by is not null)
      ))
      or (registration_source = 'online'
        and status in ('pending_review', 'approved', 'rejected')
        and payment_received_at is not null and payment_received_by is not null)
    )
  );

create or replace function private.submit_receipt(p_reservation_id uuid, p_receipt_path text)
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
  if v_reservation.registration_source <> 'online' then
    raise exception 'This reservation cannot accept an online bank receipt.' using errcode = '22023';
  end if;
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
    payment_method = 'bank_transfer', payment_received_at = null, payment_received_by = null,
    review_note = null, reviewed_at = null, reviewed_by = null, updated_at = now()
    where id = p_reservation_id returning * into v_reservation;
  return v_reservation;
end;
$$;

create or replace function private.record_cash_received(p_reservation_id uuid, p_payment_collector uuid)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_payment_collector is null or not exists (
    select 1 from auth.users u
    where u.id = p_payment_collector and not coalesce(u.is_anonymous, false)
      and (exists (select 1 from private.admins a where a.user_id = u.id)
        or coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
        or coalesce(u.raw_app_meta_data ->> 'is_admin', 'false') = 'true')
  ) then
    raise exception 'Choose an admin who collected the physical cash.' using errcode = '22023';
  end if;

  select * into v_reservation from public.reservations
  where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.' using errcode = '22023'; end if;

  if v_reservation.registration_source = 'in_person' and v_reservation.payment_method = 'cash' then
    if v_reservation.status = 'approved' and v_reservation.payment_received_at is not null then
      return v_reservation;
    end if;
    if v_reservation.status not in ('awaiting_payment', 'rejected') then
      raise exception 'This physical cash payment cannot be recorded in its current state.' using errcode = '22023';
    end if;

    update public.reservations set status = 'approved', payment_received_at = now(),
      payment_received_by = p_payment_collector, reviewed_at = null, reviewed_by = null,
      review_note = null, updated_at = now()
      where id = p_reservation_id returning * into v_reservation;

    insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
    values (p_reservation_id, 'cash_received', 'cash', v_reservation.amount_lkr,
      p_payment_collector, 'Physical cash collection recorded during in-person registration');
    return v_reservation;
  end if;

  if v_reservation.registration_source <> 'online' then
    raise exception 'This reservation cannot accept an online cash payment.' using errcode = '22023';
  end if;
  if v_reservation.payment_method = 'cash'
    and v_reservation.status in ('pending_review', 'approved')
    and v_reservation.payment_received_at is not null then
    return v_reservation;
  end if;
  if v_reservation.status not in ('awaiting_payment', 'rejected') then
    raise exception 'This reservation cannot accept a physical cash payment in its current state.' using errcode = '22023';
  end if;

  update public.reservations set status = 'pending_review', payment_method = 'cash',
    receipt_path = null, payment_received_at = now(), payment_received_by = p_payment_collector,
    reviewed_at = null, reviewed_by = null, review_note = null, updated_at = now()
    where id = p_reservation_id returning * into v_reservation;

  insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
  values (p_reservation_id, 'cash_received', 'cash', v_reservation.amount_lkr,
    p_payment_collector, 'Physical cash received for an online reservation');
  return v_reservation;
end;
$$;

create or replace function private.review_reservation(
  p_reservation_id uuid,
  p_decision text,
  p_receipt_path text,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_review_id uuid;
  v_notification_id uuid;
  v_event public.event_settings;
  v_note text := nullif(trim(p_note), '');
  v_is_online_cash boolean;
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

  select * into v_reservation from public.reservations
  where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.' using errcode = '22023'; end if;
  if v_reservation.registration_source = 'in_person' and v_reservation.payment_method = 'cash' then
    raise exception 'Physical cash is confirmed when its collector is recorded; it does not use receipt review.' using errcode = '22023';
  end if;
  if v_reservation.status <> 'pending_review' then
    raise exception 'This reservation is not waiting for payment review.' using errcode = '22023';
  end if;

  v_is_online_cash := v_reservation.registration_source = 'online'
    and v_reservation.payment_method = 'cash';
  if v_is_online_cash then
    if p_receipt_path is not null or v_reservation.receipt_path is not null then
      raise exception 'Physical cash reviews do not use a receipt slip.' using errcode = '22023';
    end if;
    if v_reservation.payment_received_at is null or v_reservation.payment_received_by is null then
      raise exception 'Record the cash collection before reviewing it.' using errcode = '22023';
    end if;
  elsif p_receipt_path is distinct from v_reservation.receipt_path then
    raise exception 'The receipt changed. Refresh before reviewing.' using errcode = '22023';
  end if;

  update public.reservations set status = p_decision, review_note = v_note,
    reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    where id = p_reservation_id returning * into v_reservation;

  insert into public.review_history(reservation_id, admin_id, decision, note, receipt_path)
  values (p_reservation_id, auth.uid(), p_decision, v_note, v_reservation.receipt_path)
  returning id into v_review_id;

  if v_is_online_cash then
    insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
    values (p_reservation_id,
      case when p_decision = 'approved' then 'cash_approved' else 'cash_rejected' end,
      'cash', v_reservation.amount_lkr, auth.uid(), coalesce(v_note, 'Physical cash payment reviewed'));
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

create or replace function private.claim_notification(p_notification_id uuid)
returns setof public.notification_outbox language sql security definer set search_path = ''
as $$
  update public.notification_outbox set status = 'sending', attempts = attempts + 1,
    claim_token = gen_random_uuid(), claimed_at = now(), last_error = null
  where id = p_notification_id and status in ('pending', 'failed') and attempts < 5
    and exists (
      select 1 from public.reservations r join public.review_history h
        on h.reservation_id = r.id
      where r.id = notification_outbox.reservation_id and h.id = notification_outbox.review_id
        and r.status = h.decision and r.receipt_path is not distinct from h.receipt_path
        and r.reviewed_at = h.created_at
    )
  returning *;
$$;

comment on column public.reservations.payment_received_by
  is 'Admin who collected the physical cash payment for an in-person or online reservation.';
comment on column public.reservations.payment_method
  is 'Bank transfer receipt or physical cash collected by an organizer.';
comment on function public.record_cash_received(uuid, uuid)
  is 'Records physical cash. In-person registrations are confirmed immediately; online reservations enter payment review.';

notify pgrst, 'reload schema';
