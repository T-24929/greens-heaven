  -- Put account setup email requests for admin-entered registrations in the same
  -- delivery log and claim/retry pipeline as reservation decision emails.

  alter table public.notification_outbox
    alter column review_id drop not null,
    add column notification_type text not null default 'reservation_decision';

  alter table public.notification_outbox
    drop constraint if exists notification_outbox_review_id_key,
    add constraint notification_outbox_type_review_check check (
      (notification_type = 'reservation_decision' and review_id is not null)
      or (notification_type = 'account_setup' and review_id is null)
    );

  create unique index notification_outbox_review_id_unique_idx
    on public.notification_outbox(review_id)
    where review_id is not null;
  create index notification_outbox_type_reservation_idx
    on public.notification_outbox(notification_type, reservation_id, created_at desc);

  comment on table public.notification_outbox is
    'Transactional outbox for reservation decisions and in-person account setup emails. Unknown delivery must be checked with the sending provider before retrying.';

  -- Existing setup sends updated account_setup_sent_at after Auth accepted them.
  -- Preserve those as sent and surface previously unsent invitations as pending.
  insert into public.notification_outbox (
    reservation_id, review_id, notification_type, recipient_email, payload,
    status, attempts, sent_at
  )
  select
    r.id, null, 'account_setup', r.email,
    jsonb_build_object('full_name', r.full_name, 'reference', r.reference),
    case when r.account_setup_sent_at is null then 'pending' else 'sent' end,
    0, r.account_setup_sent_at
  from public.reservations r
  where r.registration_source = 'in_person'
    and r.user_id is null
    and not exists (
      select 1 from public.notification_outbox n
      where n.reservation_id = r.id and n.notification_type = 'account_setup'
    );

  create function private.queue_physical_cash_setup_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if new.registration_source = 'in_person' and new.user_id is null then
      insert into public.notification_outbox (
        reservation_id, review_id, notification_type, recipient_email, payload
      ) values (
        new.id, null, 'account_setup', new.email,
        jsonb_build_object('full_name', new.full_name, 'reference', new.reference)
      );
    end if;
    return new;
  end;
  $$;

  revoke all on function private.queue_physical_cash_setup_notification()
    from public, anon, authenticated, service_role;

  create trigger reservations_queue_physical_cash_setup
  after insert on public.reservations
  for each row execute function private.queue_physical_cash_setup_notification();

  -- Idempotently obtain the one setup notification for this unclaimed ticket.
  -- This RPC is callable only by the service role after the Edge Function has
  -- authenticated and authorized the requesting admin.
  create function public.queue_account_setup_notification(p_reservation_id uuid)
  returns table(notification_id uuid, status text, attempts integer)
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_reservation public.reservations;
    v_notification public.notification_outbox;
  begin
    select * into v_reservation
    from public.reservations
    where id = p_reservation_id;

    if not found or v_reservation.registration_source <> 'in_person' then
      raise exception 'In-person registration not found.' using errcode = '22023';
    end if;

    if v_reservation.user_id is not null then
      return query select null::uuid, 'already_linked'::text, 0;
      return;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('setup:' || p_reservation_id::text, 0));

    select * into v_notification
    from public.notification_outbox n
    where n.reservation_id = p_reservation_id
      and n.notification_type = 'account_setup'
    order by n.created_at desc, n.id desc
    limit 1
    for update;

    if found then
      return query select v_notification.id, v_notification.status, v_notification.attempts;
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

  revoke all on function public.queue_account_setup_notification(uuid)
    from public, anon, authenticated, service_role;
  grant execute on function public.queue_account_setup_notification(uuid) to service_role;

  create function private.claim_account_setup_notification(p_notification_id uuid)
  returns setof public.notification_outbox
  language sql
  security definer
  set search_path = ''
  as $$
    update public.notification_outbox n
    set status = 'sending', attempts = n.attempts + 1,
        claim_token = gen_random_uuid(), claimed_at = now(), last_error = null
    where n.id = p_notification_id
      and n.status in ('pending', 'failed')
      and n.attempts < 5
      and n.notification_type = 'account_setup'
      and n.review_id is null
      and exists (
        select 1 from public.reservations r
        where r.id = n.reservation_id
          and r.registration_source = 'in_person'
          and r.user_id is null
          and lower(r.email) = lower(n.recipient_email)
      )
    returning n.*;
  $$;

  create function public.claim_account_setup_notification(p_notification_id uuid)
  returns setof public.notification_outbox
  language sql
  security invoker
  set search_path = ''
  as $$ select * from private.claim_account_setup_notification(p_notification_id); $$;

  revoke all on function private.claim_account_setup_notification(uuid),
    public.claim_account_setup_notification(uuid)
    from public, anon, authenticated, service_role;
  grant execute on function private.claim_account_setup_notification(uuid),
    public.claim_account_setup_notification(uuid)
    to service_role;

  notify pgrst, 'reload schema';
