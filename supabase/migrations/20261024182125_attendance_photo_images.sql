alter table public.reservations
  add column images text[] not null default '{}'::text[];

create or replace function private.lookup_event_ticket(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_code is null or length(trim(p_code)) > 100 then
    raise exception 'Enter a ticket reference or scan a ticket QR.' using errcode = '22023';
  end if;

  select * into r
  from public.reservations
  where id::text = trim(p_code) or reference = upper(trim(p_code));

  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', r.id,
    'reference', r.reference,
    'full_name', r.full_name,
    'status', r.status,
    'images', coalesce(r.images, '{}'::text[]),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'gate', a.gate,
        'checked_in_at', a.checked_in_at,
        'identity_checked', a.identity_checked
      ))
      from public.ticket_attendance a
      where a.reservation_id = r.id
    ), '[]'::jsonb)
  );
end;
$$;

create function private.save_ticket_images(p_reservation_id uuid, p_images text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
  cleaned_images text[];
begin
  if not private.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into r
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if r.status <> 'approved' then
    raise exception 'This ticket is not confirmed.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.ticket_attendance a
    where a.reservation_id = r.id and a.gate = 'photobooth'
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

  select coalesce(array_agg(btrim(image_name) order by ordinal), '{}'::text[])
  into cleaned_images
  from unnest(coalesce(p_images, '{}'::text[])) with ordinality as names(image_name, ordinal)
  where nullif(btrim(image_name), '') is not null;

  update public.reservations
  set images = cleaned_images
  where id = r.id;

  return cleaned_images;
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
