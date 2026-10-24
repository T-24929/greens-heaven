begin;

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

  -- The reservation row lock serializes this operation per ticket. If a legacy
  -- entrance record exists without identity verification, sliding now verifies
  -- the ID while preserving its original attendance time and operator.
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

  return jsonb_build_object(
    'already_recorded', not inserted,
    'gate', a.gate,
    'checked_in_at', a.checked_in_at,
    'reference', r.reference
  );
end;
$$;

commit;
