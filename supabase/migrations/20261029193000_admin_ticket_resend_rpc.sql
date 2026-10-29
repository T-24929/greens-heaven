create or replace function public.queue_ticket_resend(p_reservation_id uuid)
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
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
begin
  if v_role <> 'service_role' and not private.is_admin() then
    raise exception 'Admin or service role required.' using errcode = '42501';
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
grant execute on function public.queue_ticket_resend(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
