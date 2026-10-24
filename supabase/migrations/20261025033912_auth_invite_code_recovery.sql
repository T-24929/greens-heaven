create function public.queue_account_setup_resend(p_reservation_id uuid)
returns table(notification_id uuid, status text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_latest public.notification_outbox;
  v_notification public.notification_outbox;
begin
  perform pg_advisory_xact_lock(hashtextextended('setup:' || p_reservation_id::text, 0));

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found or v_reservation.registration_source <> 'in_person' then
    raise exception 'In-person registration not found.' using errcode = '22023';
  end if;

  if v_reservation.user_id is not null then
    return query select null::uuid, 'already_linked'::text, 0;
    return;
  end if;

  select * into v_latest
  from public.notification_outbox n
  where n.reservation_id = p_reservation_id
    and n.notification_type = 'account_setup'
  order by n.created_at desc, n.id desc
  limit 1
  for update;

  if found and v_latest.status in ('pending', 'sending', 'unknown') then
    return query select v_latest.id, v_latest.status, v_latest.attempts;
    return;
  end if;

  if found and v_latest.status = 'failed' and v_latest.attempts >= 5 then
    return query select v_latest.id, v_latest.status, v_latest.attempts;
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

revoke all on function public.queue_account_setup_resend(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.queue_account_setup_resend(uuid) to service_role;

notify pgrst, 'reload schema';
