begin;

-- 1. Extend notification_outbox constraints to permit 'thank_you' notifications
alter table public.notification_outbox
  drop constraint if exists notification_outbox_type_review_check,
  add constraint notification_outbox_type_review_check check (
    (notification_type = 'reservation_decision' and review_id is not null)
    or (notification_type in ('account_setup', 'ticket_resend', 'thank_you') and review_id is null)
  );

create unique index if not exists notification_outbox_thank_you_unique_idx
  on public.notification_outbox(reservation_id)
  where notification_type = 'thank_you';

-- 2. Attendee attendance query RPC
create or replace function private.get_my_attendance(p_reservation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_res_id uuid;
  v_entrance timestamptz;
  v_photobooth timestamptz;
begin
  if v_user_id is null then
    return null;
  end if;

  if p_reservation_id is not null then
    select id into v_res_id
    from public.reservations
    where id = p_reservation_id
      and (user_id = v_user_id or private.is_admin());
  else
    select id into v_res_id
    from public.reservations
    where user_id = v_user_id;
  end if;

  if v_res_id is null then
    return null;
  end if;

  select checked_in_at into v_entrance
  from public.ticket_attendance
  where reservation_id = v_res_id and gate = 'entrance';

  select checked_in_at into v_photobooth
  from public.ticket_attendance
  where reservation_id = v_res_id and gate = 'photobooth';

  return jsonb_build_object(
    'has_entrance', v_entrance is not null,
    'has_photobooth', v_photobooth is not null,
    'entrance_at', v_entrance,
    'photobooth_at', v_photobooth
  );
end;
$$;

create or replace function public.get_my_attendance(p_reservation_id uuid default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_my_attendance(p_reservation_id);
$$;

revoke all on function private.get_my_attendance(uuid), public.get_my_attendance(uuid) from public, anon, authenticated, service_role;
grant execute on function private.get_my_attendance(uuid), public.get_my_attendance(uuid) to authenticated;

-- 3. Update check_in_ticket to queue thank_you notification when photobooth is recorded
create or replace function private.check_in_ticket(
  p_reservation_id uuid,
  p_gate text,
  p_identity_checked boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
  a public.ticket_attendance;
  v_event public.event_settings;
  v_thank_you_notification_id uuid := null;
  inserted boolean;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_gate is null or p_gate not in ('entrance', 'photobooth') then
    raise exception 'Choose entrance or photo booth.' using errcode = '22023';
  end if;

  if p_identity_checked is distinct from true then
    raise exception 'Confirm the attendee identity before check-in.' using errcode = '22023';
  end if;

  select * into r
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if r.status <> 'approved' then
    raise exception 'This ticket is not confirmed. Check payment approval first.' using errcode = '22023';
  end if;

  if p_gate = 'photobooth' and not exists (
    select 1
    from public.ticket_attendance as entrance
    where entrance.reservation_id = r.id
      and entrance.gate = 'entrance'
      and entrance.identity_checked is true
  ) then
    raise exception 'Verify attendee ID at entrance before opening the photo booth session.' using errcode = '22023';
  end if;

  -- The reservation row lock serializes this operation per ticket.
  select * into a
  from public.ticket_attendance
  where reservation_id = r.id and gate = p_gate
  for update;

  if found then
    update public.ticket_attendance
    set identity_checked = true
    where reservation_id = r.id and gate = p_gate
    returning * into a;
    inserted := false;
  else
    insert into public.ticket_attendance(reservation_id, gate, checked_in_by, identity_checked)
    values (r.id, p_gate, auth.uid(), true)
    returning * into a;
    inserted := true;
  end if;

  -- If photo booth check-in is complete, queue the thank-you email if not already queued
  if p_gate = 'photobooth' and r.email is not null then
    select n.id into v_thank_you_notification_id
    from public.notification_outbox n
    where n.reservation_id = r.id
      and n.notification_type = 'thank_you'
      and n.status in ('pending', 'failed')
    order by n.created_at desc
    limit 1;

    if v_thank_you_notification_id is null and not exists (
      select 1 from public.notification_outbox n
      where n.reservation_id = r.id and n.notification_type = 'thank_you'
    ) then
      select * into strict v_event
      from public.event_settings
      where id = r.event_id;

      insert into public.notification_outbox (
        reservation_id, review_id, notification_type, recipient_email, payload
      ) values (
        r.id, null, 'thank_you', r.email,
        jsonb_build_object(
          'event_name', v_event.name,
          'reference', r.reference,
          'full_name', r.full_name,
          'status', 'thank_you',
          'starts_at', v_event.starts_at,
          'venue', v_event.venue,
          'amount_lkr', r.amount_lkr
        )
      ) returning id into v_thank_you_notification_id;
    end if;
  end if;

  return jsonb_build_object(
    'already_recorded', not inserted,
    'gate', a.gate,
    'checked_in_at', a.checked_in_at,
    'reference', r.reference,
    'thank_you_notification_id', v_thank_you_notification_id
  );
end;
$$;

-- 4. Update claim_notification to support claiming thank_you notifications
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
      or (
        n.notification_type = 'thank_you'
        and n.review_id is null
        and n.payload ->> 'status' = 'thank_you'
        and exists (
          select 1
          from public.reservations r
          where r.id = n.reservation_id
            and r.status = 'approved'
            and lower(r.email) = lower(n.recipient_email)
            and exists (
              select 1 from public.ticket_attendance a_ent
              where a_ent.reservation_id = r.id and a_ent.gate = 'entrance' and a_ent.identity_checked is true
            )
            and exists (
              select 1 from public.ticket_attendance a_pb
              where a_pb.reservation_id = r.id and a_pb.gate = 'photobooth'
            )
        )
      )
    )
  returning n.*;
end;
$$;

notify pgrst, 'reload schema';

commit;
