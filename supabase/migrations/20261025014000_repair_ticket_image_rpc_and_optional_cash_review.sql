-- Restore the exact photo-name RPC expected by the admin app and refresh
-- PostgREST's function cache after the migration.
alter table public.reservations
  add column if not exists images text[] not null default '{}'::text[];

alter table public.reservations
  alter column images set default '{}'::text[];

update public.reservations set images = '{}'::text[] where images is null;

alter table public.reservations
  alter column images set not null;

drop function if exists public.save_ticket_images(uuid, text[]);
drop function if exists public.save_ticket_images(text[], uuid);
drop function if exists private.save_ticket_images(uuid, text[]);
drop function if exists private.save_ticket_images(text[], uuid);

create function private.save_ticket_images(p_reservation_id uuid, p_images text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_cleaned_images text[];
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if v_reservation.status <> 'approved' then
    raise exception 'This ticket is not confirmed.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.ticket_attendance attendance
    where attendance.reservation_id = v_reservation.id
      and attendance.gate = 'photobooth'
  ) then
    raise exception 'Start the photo session before saving image names.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_images, '{}'::text[])) as names(image_name)
    where char_length(btrim(names.image_name)) > 500
  ) then
    raise exception 'Image names must be 500 characters or fewer.' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(names.image_name) order by names.ordinal), '{}'::text[])
  into v_cleaned_images
  from unnest(coalesce(p_images, '{}'::text[])) with ordinality as names(image_name, ordinal)
  where nullif(btrim(names.image_name), '') is not null;

  update public.reservations
  set images = v_cleaned_images
  where id = v_reservation.id;

  return v_cleaned_images;
end;
$$;

create function public.save_ticket_images(p_reservation_id uuid, p_images text[])
returns text[]
language sql
security invoker
set search_path = ''
as $$
  select private.save_ticket_images(p_reservation_id, p_images);
$$;

revoke all on function private.save_ticket_images(uuid, text[]), public.save_ticket_images(uuid, text[])
  from public, anon, authenticated, service_role;
grant execute on function private.save_ticket_images(uuid, text[]), public.save_ticket_images(uuid, text[])
  to authenticated;

-- Make second-admin cash review available, without requiring it for every payment.
create or replace function private.review_reservation(
  p_reservation_id uuid,
  p_decision text,
  p_receipt_path text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_review_id uuid;
  v_notification_id uuid;
  v_event public.event_settings;
  v_note text := nullif(trim(p_note), '');
  v_is_cash boolean;
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

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = '22023';
  end if;
  if v_reservation.status <> 'pending_review' then
    raise exception 'This reservation is not waiting for payment review.' using errcode = '22023';
  end if;

  v_is_cash := v_reservation.registration_source = 'in_person'
    and v_reservation.payment_method = 'cash';
  if v_is_cash then
    if p_receipt_path is not null or v_reservation.receipt_path is not null then
      raise exception 'Cash payments do not use a receipt slip.' using errcode = '22023';
    end if;
    if v_reservation.payment_received_at is null or v_reservation.payment_received_by is null then
      raise exception 'Record the cash collection before reviewing it.' using errcode = '22023';
    end if;
  elsif p_receipt_path is distinct from v_reservation.receipt_path then
    raise exception 'The receipt changed. Refresh before reviewing.' using errcode = '22023';
  end if;

  update public.reservations
  set status = p_decision,
      review_note = v_note,
      reviewed_at = now(),
      updated_at = now(),
      reviewed_by = auth.uid()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.review_history(reservation_id, admin_id, decision, note, receipt_path)
  values (p_reservation_id, auth.uid(), p_decision, v_note, v_reservation.receipt_path)
  returning id into v_review_id;

  if v_is_cash then
    insert into public.payment_events (reservation_id, event_type, payment_method, amount_lkr, admin_id, note)
    values (
      p_reservation_id,
      case when p_decision = 'approved' then 'cash_approved' else 'cash_rejected' end,
      'cash', v_reservation.amount_lkr, auth.uid(), coalesce(v_note, 'Cash payment reviewed')
    );
  end if;

  select * into strict v_event
  from public.event_settings
  where id = v_reservation.event_id;

  insert into public.notification_outbox(reservation_id, review_id, recipient_email, payload)
  values (p_reservation_id, v_review_id, v_reservation.email, jsonb_build_object(
    'event_name', v_event.name,
    'reference', v_reservation.reference,
    'full_name', v_reservation.full_name,
    'status', p_decision,
    'review_note', v_note,
    'amount_lkr', v_reservation.amount_lkr,
    'payment_method', v_reservation.payment_method,
    'starts_at', v_event.starts_at,
    'venue', v_event.venue
  )) returning id into v_notification_id;

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'notification_id', v_notification_id
  );
end;
$$;

comment on function public.save_ticket_images(uuid, text[]) is 'Save image names for a confirmed ticket after its photo-booth attendance record is created.';
notify pgrst, 'reload schema';
