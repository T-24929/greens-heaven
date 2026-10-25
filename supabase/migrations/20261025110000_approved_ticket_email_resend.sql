-- Explicit ticket resends are separate delivery attempts. They do not alter
-- reservation status or create another payment review record.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_type_review_check,
  add constraint notification_outbox_type_review_check check (
    (notification_type = 'reservation_decision' and review_id is not null)
    or (notification_type in ('account_setup', 'ticket_resend') and review_id is null)
  );

create function public.queue_ticket_resend(p_reservation_id uuid)
returns table(notification_id uuid, status text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_event public.event_settings;
  v_notification public.notification_outbox;
  v_retry_notification public.notification_outbox;
  v_has_current_approval boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ticket-notification:' || p_reservation_id::text, 0));

  select * into v_reservation
  from public.reservations r
  where r.id = p_reservation_id
  for share;

  if not found or v_reservation.status <> 'approved' or v_reservation.email is null then
    raise exception 'Only an approved ticket can be resent.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.review_history h
    where h.reservation_id = v_reservation.id
      and h.decision = 'approved'
      and h.created_at = v_reservation.reviewed_at
      and h.receipt_path is not distinct from v_reservation.receipt_path
  ) into v_has_current_approval;

  if not v_has_current_approval and not (
    v_reservation.registration_source = 'in_person'
    and v_reservation.payment_method = 'cash'
    and v_reservation.payment_received_at is not null
    and v_reservation.payment_received_by is not null
  ) then
    raise exception 'Only an approved ticket can be resent.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.notification_outbox n
    where n.reservation_id = v_reservation.id
      and n.notification_type in ('reservation_decision', 'ticket_resend')
      and n.payload ->> 'status' = 'approved'
      and n.status in ('pending', 'sending', 'unknown')
      and (
        (
          n.notification_type = 'ticket_resend'
          and (n.payload ->> 'approval_at')::timestamptz is not distinct from v_reservation.reviewed_at
          and lower(n.recipient_email) = lower(v_reservation.email)
        )
        or exists (
          select 1
          from public.review_history h
          where h.id = n.review_id
            and h.reservation_id = v_reservation.id
            and h.decision = 'approved'
            and h.created_at = v_reservation.reviewed_at
            and h.receipt_path is not distinct from v_reservation.receipt_path
        )
      )
  ) then
    raise exception 'Ticket email is pending or its delivery needs checking.' using errcode = '55000';
  end if;

  select n.* into v_retry_notification
  from public.notification_outbox n
  where n.reservation_id = v_reservation.id
    and n.payload ->> 'status' = 'approved'
    and n.status = 'failed'
    and n.attempts < 5
    and (
      (
        n.notification_type = 'ticket_resend'
        and (n.payload ->> 'approval_at')::timestamptz is not distinct from v_reservation.reviewed_at
        and lower(n.recipient_email) = lower(v_reservation.email)
      )
      or (
        n.notification_type = 'reservation_decision'
        and exists (
          select 1
          from public.review_history h
          where h.id = n.review_id
            and h.reservation_id = v_reservation.id
            and h.decision = 'approved'
            and h.created_at = v_reservation.reviewed_at
            and h.receipt_path is not distinct from v_reservation.receipt_path
        )
      )
    )
  order by n.created_at desc, n.id desc
  limit 1
  for update;

  if found then
    return query select v_retry_notification.id, v_retry_notification.status, v_retry_notification.attempts;
    return;
  end if;

  select * into strict v_event
  from public.event_settings e
  where e.id = v_reservation.event_id;

  insert into public.notification_outbox (
    reservation_id, review_id, notification_type, recipient_email, payload
  ) values (
    v_reservation.id, null, 'ticket_resend', v_reservation.email,
    jsonb_build_object(
      'event_name', v_event.name,
      'reference', v_reservation.reference,
      'full_name', v_reservation.full_name,
      'status', 'approved',
      'approval_at', v_reservation.reviewed_at,
      'review_note', v_reservation.review_note,
      'amount_lkr', v_reservation.amount_lkr,
      'payment_method', v_reservation.payment_method,
      'starts_at', v_event.starts_at,
      'venue', v_event.venue
    )
  ) returning * into v_notification;

  return query select v_notification.id, v_notification.status, v_notification.attempts;
end;
$$;

revoke all on function public.queue_ticket_resend(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.queue_ticket_resend(uuid) to service_role;

create or replace function private.claim_notification(p_notification_id uuid)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
begin
  select n.reservation_id into v_reservation_id
  from public.notification_outbox n
  where n.id = p_notification_id;
  if not found then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('ticket-notification:' || v_reservation_id::text, 0));

  return query
  update public.notification_outbox n
  set status = 'sending', attempts = n.attempts + 1,
      claim_token = gen_random_uuid(), claimed_at = now(), last_error = null
  where n.id = p_notification_id
    and n.status in ('pending', 'failed')
    and n.attempts < 5
    and (
      (
        n.notification_type = 'reservation_decision'
        and exists (
          select 1
          from public.reservations r
          join public.review_history h on h.reservation_id = r.id
          where r.id = n.reservation_id
            and h.id = n.review_id
            and r.status = h.decision
            and r.receipt_path is not distinct from h.receipt_path
            and r.reviewed_at = h.created_at
        )
      )
      or (
        n.notification_type = 'ticket_resend'
        and n.review_id is null
        and n.payload ->> 'status' = 'approved'
        and exists (
          select 1
          from public.reservations r
          where r.id = n.reservation_id
            and r.status = 'approved'
            and lower(r.email) = lower(n.recipient_email)
            and (n.payload ->> 'approval_at')::timestamptz is not distinct from r.reviewed_at
            and (
              exists (
                select 1
                from public.review_history h
                where h.reservation_id = r.id
                  and h.decision = 'approved'
                  and h.created_at = r.reviewed_at
                  and h.receipt_path is not distinct from r.receipt_path
              )
              or (
                r.registration_source = 'in_person'
                and r.payment_method = 'cash'
                and r.payment_received_at is not null
                and r.payment_received_by is not null
              )
            )
        )
      )
    )
  returning n.*;
end;
$$;

notify pgrst, 'reload schema';
